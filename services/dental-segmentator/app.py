from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import numpy as np
import SimpleITK as sitk
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from arch import extract_dental_arch
from fast_arch import extract_fast_arch


MODEL_DATASET = os.getenv("DENTAL_SEGMENTATOR_DATASET", "Dataset112_DentalSegmentator_v100")
DEVICE = os.getenv("DENTAL_SEGMENTATOR_DEVICE", "cuda" if shutil.which("nvidia-smi") else "cpu")
MODE = os.getenv("DENTAL_SEGMENTATOR_MODE", "fast").lower()
RESULTS_ROOT = Path(os.getenv("NNUNET_RESULTS", "/models/nnUNet_results"))
WORK_ROOT = Path(os.getenv("DENTAL_SEGMENTATOR_WORKDIR", "/tmp/dental-segmentator"))
MAX_UPLOAD_BYTES = int(os.getenv("DENTAL_SEGMENTATOR_MAX_UPLOAD_MB", "2048")) * 1024 * 1024
JOBS: dict[str, dict] = {}
INFERENCE_LOCK = asyncio.Lock()

app = FastAPI(title="DentalSegmentator Arch Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("DENTAL_SEGMENTATOR_CORS", "*").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def model_ready() -> bool:
    return (RESULTS_ROOT / MODEL_DATASET).is_dir()


def read_dicom_series(directory: Path) -> sitk.Image:
    series_ids = sitk.ImageSeriesReader.GetGDCMSeriesIDs(str(directory))
    if not series_ids:
        raise ValueError("Yüklenen klasörde okunabilir DICOM serisi bulunamadı.")
    series = max(series_ids, key=lambda item: len(sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(directory), item)))
    filenames = sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(directory), series)
    if len(filenames) < 16:
        raise ValueError("DentalSegmentator için en az 16 CBCT kesiti gerekir.")
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(filenames)
    return reader.Execute()


def run_inference(job_id: str, case_dir: Path, preferred_slice: int | None) -> None:
    started = time.monotonic()
    job = JOBS[job_id]
    try:
        # The fast path is intentionally model-free: it samples a small axial
        # slab and is useful for local/manual testing. Full nnU-Net mode still
        # requires the mounted DentalSegmentator weights.
        if MODE != "fast" and not model_ready():
            raise RuntimeError("DentalSegmentator ağırlıkları sunucuda hazır değil.")
        job.update(status="running", progress="DICOM hacmi hazırlanıyor")
        image = read_dicom_series(case_dir / "dicom")
        if MODE == "fast":
            job["progress"] = "Hızlı CPU arch: seçilmiş axial dilimler"
            arch = extract_fast_arch(sitk.GetArrayFromImage(image), preferred_slice=preferred_slice)
            job.update(
                status="complete",
                progress="Tamamlandı",
                result={
                    "points": arch.points,
                    "jaw": arch.jaw,
                    "axialSlice": arch.axial_slice,
                    "confidence": arch.confidence,
                    "durationMs": round((time.monotonic() - started) * 1000),
                    "device": "cpu",
                    "model": "fast-axial-heuristic",
                },
            )
            return
        input_dir = case_dir / "input"
        output_dir = case_dir / "output"
        input_dir.mkdir()
        output_dir.mkdir()
        sitk.WriteImage(image, str(input_dir / "case_0000.nii.gz"), True)

        job["progress"] = f"DentalSegmentator {DEVICE.upper()} üzerinde çalışıyor"
        env = os.environ.copy()
        env["nnUNet_raw"] = str(case_dir / "nnUNet_raw")
        env["nnUNet_preprocessed"] = str(case_dir / "nnUNet_preprocessed")
        env["nnUNet_results"] = str(RESULTS_ROOT)
        command = [
            "nnUNetv2_predict", "-i", str(input_dir), "-o", str(output_dir),
            "-d", MODEL_DATASET, "-c", "3d_fullres", "-f", "0",
            "-device", DEVICE, "--disable_tta", "-npp", "1", "-nps", "1",
        ]
        completed = subprocess.run(command, env=env, capture_output=True, text=True, timeout=7200)
        if completed.returncode:
            detail = (completed.stderr or completed.stdout)[-2000:]
            raise RuntimeError(f"nnU-Net inference başarısız: {detail}")

        prediction = output_dir / "case.nii.gz"
        if not prediction.exists():
            predictions = list(output_dir.glob("*.nii.gz"))
            if not predictions:
                raise RuntimeError("nnU-Net segmentasyon dosyası üretmedi.")
            prediction = predictions[0]
        segmentation = sitk.GetArrayFromImage(sitk.ReadImage(str(prediction))).astype(np.uint8)
        arch = extract_dental_arch(segmentation, preferred_slice=preferred_slice)
        job.update(
            status="complete",
            progress="Tamamlandı",
            result={
                "points": arch.points,
                "jaw": arch.jaw,
                "axialSlice": arch.axial_slice,
                "confidence": arch.confidence,
                "durationMs": round((time.monotonic() - started) * 1000),
                "device": DEVICE,
                "model": MODEL_DATASET,
            },
        )
    except Exception as error:
        job.update(status="failed", error=str(error))
    finally:
        shutil.rmtree(case_dir, ignore_errors=True)


async def queued_inference(job_id: str, case_dir: Path, preferred_slice: int | None) -> None:
    async with INFERENCE_LOCK:
        await asyncio.to_thread(run_inference, job_id, case_dir, preferred_slice)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "modelReady": model_ready(), "mode": MODE, "dataset": MODEL_DATASET, "device": DEVICE}


@app.post("/v1/arch", status_code=202)
async def create_arch_job(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    preferred_slice: int | None = Form(default=None),
) -> dict:
    if MODE != "fast" and not model_ready():
        raise HTTPException(status_code=503, detail="DentalSegmentator ağırlıkları sunucuda hazır değil.")
    if len(files) < 16:
        raise HTTPException(status_code=400, detail="En az 16 DICOM kesiti gönderilmelidir.")

    job_id = uuid.uuid4().hex
    case_dir = Path(tempfile.mkdtemp(prefix=f"{job_id}-", dir=WORK_ROOT))
    dicom_dir = case_dir / "dicom"
    dicom_dir.mkdir(parents=True)
    total = 0
    try:
        for index, upload in enumerate(files):
            target = dicom_dir / f"{index:06d}.dcm"
            with target.open("wb") as output:
                while chunk := await upload.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD_BYTES:
                        raise HTTPException(status_code=413, detail="CBCT yüklemesi boyut sınırını aşıyor.")
                    output.write(chunk)
    except Exception:
        shutil.rmtree(case_dir, ignore_errors=True)
        raise

    JOBS[job_id] = {"id": job_id, "status": "queued", "progress": "Sırada"}
    background_tasks.add_task(queued_inference, job_id, case_dir, preferred_slice)
    return JOBS[job_id]


@app.get("/v1/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Segmentasyon işi bulunamadı.")
    return job


WORK_ROOT.mkdir(parents=True, exist_ok=True)
