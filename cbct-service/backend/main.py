"""Yerel CBCT Veri Seti, DICOM Meta Ayrıştırma ve PyTorch MPS AI Segmentasyon Servisi.

Mimari Rolü:
- Tarayıcı hiçbir zaman sinir ağı modelini indirmez. Aynı bilgisayarda (`127.0.0.1:8000`)
  çalışan bu servis, DICOM serisini tek seferde okur, Meyer / KaVo / NewTom uyumlu hasta ve
  cihaz meta bilgilerini ayrıştırır ve PyTorch MPS üzerinde `DentalSegmentator` çıkarımını yürütür.
- Hasta görüntüleri ve kimlik bilgileri bilgisayar dışına çıkmaz (`localOnly: True`).
- Web arayüzü hem yerel (`localhost`) hem de kurumsal bir HTTPS domain (`https://...`) üzerinden
  açıldığında `Access-Control-Allow-Private-Network: true` ve CORS desteği ile sorunsuz bağlanır.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import inspect
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import SimpleITK as sitk
from dateutil import parser as dateutil_parser
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

import dental_infer
from sync import HEARTBEAT_SECONDS, EventBus, FolderPickBroker, sse

# ---- Servis Sabitleri ve Çalışma Zamanı Durumu ----------------------------------------------
HERE = Path(__file__).parent
ENGINE = os.environ.get("TS_ENGINE", "auto").lower()
EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cbct-ai")

# Tarayıcı ve Electron yöneticisi sürüm uyumluluğunu bu sabitle doğrular.
API_VERSION = 3
INSTANCE_ID = uuid.uuid4().hex


def _code_version() -> str:
    """Çalışan backend kodunun kısa SHA-1 parmak izini üretir (günlük ve hata takibi için)."""
    digest = hashlib.sha1()
    if getattr(sys, "frozen", False):
        info = Path(sys.executable).stat()
        digest.update(f"{info.st_size}:{int(info.st_mtime)}".encode())
    else:
        here = Path(__file__).resolve().parent
        for name in sorted(p.name for p in here.glob("*.py") if not p.name.startswith("test_")):
            digest.update(name.encode())
            digest.update((here / name).read_bytes())
    return digest.hexdigest()[:8]


CODE_VERSION = _code_version()
STARTED_AT = time.time()
# Electron masaüstü yöneticisi her başlatmada rastgele bir kontrol anahtarı üretir.
CONTROL_TOKEN = os.environ.get("PINECLINIC_CONTROL_TOKEN", "")
# Son görüntüleyici sekmesi kapandıktan sonra bellekteki veri setinin temizlenme süresi (saniye).
IDLE_RELEASE_SECONDS = float(os.environ.get("PINECLINIC_IDLE_RELEASE", str(30 * 60)))
BUS = EventBus()
PICKS = FolderPickBroker()
SERVER: object | None = None


@dataclass
class Dataset:
    """Bellekte tutulan aktif CBCT hacmi ve ayrıştırılmış DICOM meta bilgileri."""
    image: sitk.Image
    fingerprint: str
    source: str
    dicom_meta: dict[str, str] = field(default_factory=dict)
    clinic_domain: str = "local"
    created_at: float = field(default_factory=time.time)


@dataclass
class Job:
    """Tek bir AI segmentasyon işinin anlık durumu ve üretilen 3B maskesi."""
    dataset_id: str
    state: str = "queued"  # queued | running | done | failed | cancelled
    stage: str = "queued"
    progress: float = 0.0
    detail: str = ""
    provider: str = ""
    started_at: float | None = None
    finished_at: float | None = None
    mask: np.ndarray | None = None
    mask_schema: str = "dental-segmentator-v1"
    cancel_requested: bool = False


DATASETS: dict[str, Dataset] = {}
JOBS: dict[str, Job] = {}
# Aynı DICOM serisi aynı klinik domain'inde tekrar açıldığında AI çıkarımını yeniden yapmamak için
# yalnızca RAM'de tutulan, klinik domain'ine göre izole edilmiş kesin parmak izi önbelleği.
RESULT_CACHE: OrderedDict[tuple[str, str, str], tuple[np.ndarray, str, str]] = OrderedDict()
STORE_LOCK = threading.Lock()


def _normalize_domain(raw: str | None) -> str:
    """Domain bilgisini küçük harfe çevirir, şema/port ve `www.` önekini temizler."""
    if not raw:
        return ""
    val = raw.strip().lower()
    if "://" in val:
        try:
            val = (urlparse(val).hostname or "").strip().lower()
        except Exception:
            val = ""
    else:
        val = val.split("/")[0].split(":")[0].strip()
    if val.startswith("www."):
        val = val[4:]
    if val in {"localhost", "127.0.0.1", "[::1]", "::1", "null", ""}:
        return "local"
    return val


def _extract_clinic_domain(request: Request) -> str:
    """İstekten aktif kliniğin domain bilgisini (`X-Clinic-Domain`, `?domain=` veya `Origin`) çıkarır."""
    header_dom = _normalize_domain(request.headers.get("x-clinic-domain"))
    if header_dom:
        return header_dom
    query_dom = _normalize_domain(request.query_params.get("domain"))
    if query_dom:
        return query_dom
    origin_dom = _normalize_domain(request.headers.get("origin"))
    if origin_dom:
        return origin_dom
    return "local"


def log(*args: object) -> None:
    """Standart hata akışına zaman damgasız servis günlüğü yazar."""
    print("[cbct]", *args, file=sys.stderr, flush=True)


# ---- Meyer / KaVo / NewTom Uyumlu DICOM Meta ve Tarih Ayrıştırıcı ---------------------------
def _clean_dicom_Person_name(raw: str) -> str:
    """DICOM PN (Person Name) formatındaki `SOYAD^AD^İKİNCİ` dizgesini temiz `Ad Soyad` haline çevirir."""
    cleaned = raw.strip().strip("^").replace("=", " ").strip()
    if not cleaned:
        return ""
    if "^" in cleaned:
        parts = [p.strip() for p in cleaned.split("^") if p.strip()]
        if len(parts) >= 2:
            # DICOM standardı: FamilyName^GivenName^MiddleName -> GivenName FamilyName
            cleaned = " ".join(parts[1:] + [parts[0]])
        elif parts:
            cleaned = parts[0]
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if cleaned.isupper():
        cleaned = cleaned.title()
    return cleaned


def format_dicom_date_time(
    date_raw: str = "",
    time_raw: str = "",
    dt_raw: str = "",
) -> tuple[str, tuple[int, int, int] | None]:
    """`python-dateutil` ve DICOM DA/TM/DT kurallarıyla kademeli tarih/saat formatlar.

    Format Kuralları:
    - Sadece yıl varsa: `YYYY` (örn. `1982`)
    - Ay ve yıl varsa: `AA.YYYY` (örn. `05.1982`)
    - Gün, ay ve yıl varsa: `GG.AA.YYYY` (örn. `14.05.1982`)
    - Saat + gün, ay ve yıl varsa: `SS:DD · GG.AA.YYYY` (örn. `14:35 · 28.10.2026`)
    """
    d_str = (date_raw or "").strip()
    t_str = (time_raw or "").strip()
    dt_str = (dt_raw or "").strip()

    # Birleşik AcquisitionDateTime (0008|002a: YYYYMMDDHHMMSS.ffffff) varsa parçala
    if not d_str and dt_str:
        digits = re.sub(r"[^0-9]", "", dt_str)
        if len(digits) >= 8:
            d_str = digits[:8]
            if not t_str and len(digits) >= 12:
                t_str = digits[8:]

    if not d_str:
        return "—", None

    # Saat ayrıştırma (HHMMSS, HH:MM:SS, HHMM)
    hh_mm = ""
    if t_str:
        t_clean = t_str.split(".")[0].strip()
        t_digits = re.sub(r"[^0-9]", "", t_clean)
        if len(t_digits) >= 4:
            hh, mm = int(t_digits[:2]), int(t_digits[2:4])
            if 0 <= hh <= 23 and 0 <= mm <= 59 and not (hh == 0 and mm == 0 and t_digits.startswith("000000")):
                hh_mm = f"{hh:02d}:{mm:02d}"

    # 1) Salt rakam DICOM DA formatları: YYYY, YYYYMM, YYYYMMDD (Meyer'de 19820000 gibi sıfırlı olabilir)
    only_digits = re.sub(r"[^0-9]", "", d_str)
    if len(only_digits) == 8:
        yyyy, mm, dd = int(only_digits[:4]), int(only_digits[4:6]), int(only_digits[6:8])
        if 1900 <= yyyy <= 2100:
            if mm == 0 or not (1 <= mm <= 12):
                return f"{yyyy}", (yyyy, 0, 0)
            if dd == 0 or not (1 <= dd <= 31):
                return f"{mm:02d}.{yyyy}", (yyyy, mm, 0)
            date_formatted = f"{dd:02d}.{mm:02d}.{yyyy}"
            return (f"{hh_mm} · {date_formatted}" if hh_mm else date_formatted), (yyyy, mm, dd)
    elif len(only_digits) == 6:
        yyyy, mm = int(only_digits[:4]), int(only_digits[4:6])
        if 1900 <= yyyy <= 2100 and 1 <= mm <= 12:
            return f"{mm:02d}.{yyyy}", (yyyy, mm, 0)
    elif len(only_digits) == 4:
        yyyy = int(only_digits)
        if 1900 <= yyyy <= 2100:
            return f"{yyyy}", (yyyy, 0, 0)

    # 2) Ayraçlı tarih formatları (YYYY-MM, MM.YYYY, YYYY.MM.DD vb.) -> python-dateutil ile çözümle
    parts = [p for p in re.split(r"[-./\s]+", d_str) if p.isdigit()]
    if len(parts) == 2:
        a, b = int(parts[0]), int(parts[1])
        if 1900 <= a <= 2100 and 1 <= b <= 12:
            return f"{b:02d}.{a}", (a, b, 0)
        if 1900 <= b <= 2100 and 1 <= a <= 12:
            return f"{a:02d}.{b}", (b, a, 0)

    try:
        parsed = dateutil_parser.parse(d_str, dayfirst=False, yearfirst=True)
        date_formatted = f"{parsed.day:02d}.{parsed.month:02d}.{parsed.year:04d}"
        return (f"{hh_mm} · {date_formatted}" if hh_mm else date_formatted), (parsed.year, parsed.month, parsed.day)
    except Exception:
        return d_str, None


def _normalize_vendor_and_model(manufacturer: str, model: str, station: str) -> str:
    """Meyer, KaVo ve NewTom cihaz isimlerini hekimlerin tanıdığı standart klinik formata dönüştürür."""
    mfg = manufacturer.strip()
    mdl = model.strip()
    stn = station.strip()
    combined_low = f"{mfg} {mdl} {stn}".lower()

    brand = mfg
    if any(k in combined_low for k in ("newtom", "qr s.r.l", "qr srl", "cefla")) or mfg.upper() == "QR":
        brand = "NewTom"
    elif any(k in combined_low for k in ("kavo", "imaging sciences", "i-cat", "op 3d", "op3d", "3d exam")):
        brand = "KaVo"
    elif any(k in combined_low for k in ("meyer", "mydent", "ss-x9010", "pd-x9010")):
        brand = "Meyer"

    if brand and mdl:
        if mdl.lower().startswith(brand.lower()):
            return mdl
        return f"{brand} {mdl}"
    if brand:
        return f"{brand} ({stn})" if stn and stn.lower() != brand.lower() else brand
    if mdl:
        return mdl
    return stn or "—"


def extract_dicom_meta(image: sitk.Image, first_file: Path | None = None) -> dict[str, str]:
    """SimpleITK görüntüsünden ve ilk DICOM diliminden Meyer/KaVo/NewTom uyumlu meta verileri çıkarır."""
    tags: dict[str, str] = {}

    # 1) İlk dilim dosyası varsa SimpleITK ImageFileReader ile tüm genel ve özel etiketleri oku
    if first_file and first_file.is_file():
        try:
            info_reader = sitk.ImageFileReader()
            info_reader.SetFileName(str(first_file))
            info_reader.LoadPrivateTagsOn()
            info_reader.ReadImageInformation()
            for key in info_reader.GetMetaDataKeys():
                tags[key.lower()] = info_reader.GetMetaData(key).strip()
        except Exception as exc:
            log(f"DICOM tag read warning on {first_file.name}: {exc}")

    # 2) Görüntü nesnesi üzerinde doğrudan taşınan etiketler varsa ekle
    try:
        for key in image.GetMetaDataKeys():
            k_low = key.lower()
            if k_low not in tags:
                tags[k_low] = image.GetMetaData(key).strip()
    except Exception:
        pass

    def get_tag(*keys: str) -> str:
        for k in keys:
            val = tags.get(k.lower(), "").strip()
            if val:
                return val
        return ""

    # Hasta Adı Soyadı ve ID
    patient_name = _clean_dicom_Person_name(get_tag("0010|0010")) or "—"
    patient_id = get_tag("0010|0020") or "—"

    # Çekim Tarihi ve Saati (Study -> Series -> Acquisition -> Content sırasıyla)
    study_date_raw = get_tag("0008|0020", "0008|0021", "0008|0022", "0008|0023")
    study_time_raw = get_tag("0008|0030", "0008|0031", "0008|0032", "0008|0033")
    acq_dt_raw = get_tag("0008|002a")
    study_date_str, study_ymd = format_dicom_date_time(study_date_raw, study_time_raw, acq_dt_raw)

    # Doğum Tarihi ve Yaş Hesabı
    birth_raw = get_tag("0010|0030")
    birth_str, birth_ymd = format_dicom_date_time(birth_raw)
    age_tag = get_tag("0010|1010")  # Örn: "044Y"
    age_years: int | None = None
    if age_tag and age_tag[:3].isdigit():
        age_years = int(age_tag[:3])
    elif birth_ymd and birth_ymd[0] > 0:
        ref_year, ref_month, ref_day = study_ymd if (study_ymd and study_ymd[0] > 0) else (datetime.now().year, datetime.now().month, datetime.now().day)
        age_years = ref_year - birth_ymd[0]
        if birth_ymd[1] > 0 and ref_month > 0:
            if (ref_month, max(ref_day, 1)) < (birth_ymd[1], max(birth_ymd[2], 1)):
                age_years -= 1
    if birth_str != "—" and age_years is not None and 0 <= age_years <= 120:
        birth_str = f"{birth_str} ({age_years} yaş)"

    # Cinsiyet
    sex_raw = get_tag("0010|0040").upper()
    sex_map = {"M": "Erkek", "E": "Erkek", "F": "Kadın", "K": "Kadın", "O": "Diğer"}
    patient_sex = sex_map.get(sex_raw, sex_raw if sex_raw else "—")

    # Cihaz / Marka / Model (Meyer, KaVo, NewTom uyumlu)
    device_str = _normalize_vendor_and_model(
        get_tag("0008|0070"),
        get_tag("0008|1090"),
        get_tag("0008|1010"),
    )

    # Klinik ve Hekim
    institution = get_tag("0008|0080")
    physician = _clean_dicom_Person_name(get_tag("0008|0090", "0008|1048", "0008|1050"))
    clinic_parts = [p for p in (institution, physician) if p]
    clinic_str = " · ".join(clinic_parts) if clinic_parts else "—"

    # Çekim Gücü: kVp, mA (veya Meyer μA -> mA), Süre (ms -> sn)
    kvp_raw = get_tag("0018|0060")
    ma_raw = get_tag("0018|1151")
    ua_raw = get_tag("0018|8151")  # Meyer mikroamper etiketi
    exp_ms_raw = get_tag("0018|1150", "0018|9328")
    power_parts: list[str] = []
    try:
        if kvp_raw:
            power_parts.append(f"{float(kvp_raw):.0f} kVp")
    except ValueError:
        pass
    try:
        if ma_raw:
            power_parts.append(f"{float(ma_raw):.1f} mA".replace(".0 mA", " mA"))
        elif ua_raw:
            ma_val = float(ua_raw) / 1000.0
            power_parts.append(f"{ma_val:.1f} mA".replace(".0 mA", " mA"))
    except ValueError:
        pass
    try:
        if exp_ms_raw:
            ms_val = float(exp_ms_raw)
            sec_val = ms_val / 1000.0 if ms_val >= 50 else ms_val
            if sec_val > 0:
                power_parts.append(f"{sec_val:.1f} sn".replace(".0 sn", " sn"))
    except ValueError:
        pass
    exposure_str = " · ".join(power_parts) if power_parts else "—"

    # Radyasyon Dozu: CTDIvol (mGy), DAP (dGy·cm² -> mGy·cm² veya Meyer 0018|9473), mAs
    ctdi_raw = get_tag("0018|9345")
    dap_raw = get_tag("0018|115e", "0018|9473")
    mas_raw = get_tag("0018|1152")
    uas_raw = get_tag("0018|1153")
    dose_parts: list[str] = []
    try:
        if ctdi_raw and float(ctdi_raw) > 0:
            dose_parts.append(f"{float(ctdi_raw):.1f} mGy (CTDI)")
    except ValueError:
        pass
    try:
        if dap_raw and float(dap_raw) > 0:
            dap_val = float(dap_raw)
            # KaVo/NewTom dGy·cm² (< 20) ise mGy·cm²'ye çevir
            dap_mgy = dap_val * 100.0 if dap_val < 25 else dap_val
            dose_parts.append(f"{dap_mgy:.0f} mGy·cm² (DAP)")
    except ValueError:
        pass
    try:
        if mas_raw and float(mas_raw) > 0:
            dose_parts.append(f"{float(mas_raw):.1f} mAs".replace(".0 mAs", " mAs"))
        elif uas_raw and float(uas_raw) > 0:
            dose_parts.append(f"{float(uas_raw) / 1000.0:.1f} mAs".replace(".0 mAs", " mAs"))
    except ValueError:
        pass
    dose_str = " · ".join(dose_parts) if dose_parts else "—"

    # Çekim Alanı (FOV - cm) ve Kesit Çözünürlüğü (Voksel - mm)
    nx, ny, nz = image.GetSize()
    sx, sy, sz = image.GetSpacing()
    fov_x, fov_y, fov_z = (nx * sx) / 10.0, (ny * sy) / 10.0, (nz * sz) / 10.0
    fov_str = f"{fov_x:.1f} × {fov_y:.1f} × {fov_z:.1f} cm"
    if abs(sx - sy) < 0.01 and abs(sy - sz) < 0.01:
        res_str = f"{sx:.2f} mm voksel ({nx}×{ny}×{nz})"
    else:
        res_str = f"{sx:.2f}×{sy:.2f}×{sz:.2f} mm ({nx}×{ny}×{nz})"

    return {
        "patientName": patient_name,
        "patientId": patient_id,
        "birthDate": birth_str,
        "sex": patient_sex,
        "studyDate": study_date_str,
        "device": device_str,
        "clinic": clinic_str,
        "exposure": exposure_str,
        "dose": dose_str,
        "fov": fov_str,
        "resolution": res_str,
    }


# ---- Yardımcı Özet ve Yaşam Döngüsü Fonksiyonları -------------------------------------------
def dataset_summary(dataset_id: str, dataset: Dataset) -> dict[str, object]:
    return {
        "datasetId": dataset_id,
        "source": dataset.source,
        "clinicDomain": dataset.clinic_domain,
        "openedAt": dataset.created_at,
        "dimensions": list(dataset.image.GetSize()),
        "spacing": list(dataset.image.GetSpacing()),
        "dicomMeta": dataset.dicom_meta,
    }


def job_summary(job_id: str, job: Job) -> dict[str, object]:
    return {
        "jobId": job_id,
        "datasetId": job.dataset_id,
        "state": job.state,
        "stage": job.stage,
        "progress": job.progress,
        "detail": job.detail,
        "provider": job.provider,
        "startedAt": job.started_at,
        "finishedAt": job.finished_at,
    }


def publish_job(job_id: str, job: Job, *, progress_only: bool = False) -> None:
    """İş durumunu SSE üzerinden yayınlar. İlerleme adımları hız sınırına tabidir; durum geçişleri anında iletilir."""
    with STORE_LOCK:
        data = job_summary(job_id, job)
    if progress_only:
        BUS.publish("job.progress", data, throttle_key=job_id)
    else:
        BUS.publish(f"job.{job.state}", data)


def snapshot() -> dict[str, object]:
    """Yeni bağlanan bir istemciye gönderilen `hello` olayı için servisin tam durum özeti."""
    engine, provider = selected_engine()
    with STORE_LOCK:
        datasets = [dataset_summary(i, d) for i, d in DATASETS.items()]
        jobs = [job_summary(i, j) for i, j in JOBS.items()]
    return {
        "instanceId": INSTANCE_ID,
        "apiVersion": API_VERSION,
        "codeVersion": CODE_VERSION,
        "startedAt": STARTED_AT,
        "engine": engine,
        "provider": provider,
        "gpuAvailable": dental_infer.gpu_available(),
        "mpsAvailable": dental_infer.mps_available(),
        "datasets": datasets,
        "jobs": jobs,
        "clients": BUS.counts(),
    }


def require_control(token: str | None) -> None:
    """Yalnızca Electron masaüstü yöneticisinin çağırabileceği kontrol uç noktalarını doğrular."""
    if not CONTROL_TOKEN or not token or not hmac.compare_digest(token, CONTROL_TOKEN):
        raise HTTPException(403, "Control endpoint requires the service manager token")


def release_dataset(dataset_id: str, reason: str) -> bool:
    """Veri setini ve ona bağlı aktif/tamamlanmış AI işlerini bellekten temizler."""
    with STORE_LOCK:
        dataset = DATASETS.pop(dataset_id, None)
        released = {job_id: job for job_id, job in JOBS.items() if job.dataset_id == dataset_id}
        interrupted = []
        for job_id, job in released.items():
            job.cancel_requested = True
            if job.state in {"queued", "running"}:
                job.state, job.stage, job.finished_at = "cancelled", "dataset released", time.time()
                interrupted.append(job_id)
            job.mask = None
            JOBS.pop(job_id, None)
    if not dataset:
        return False
    for job_id in interrupted:
        BUS.publish("job.cancelled", job_summary(job_id, released[job_id]))
    BUS.publish("dataset.released", {"datasetId": dataset_id, "reason": reason})
    log(f"released dataset {dataset_id} ({reason})")
    return True


async def idle_release_loop() -> None:
    """Tüm görüntüleyiciler kapandıktan sonra açık kalan veri setlerini zaman aşımıyla serbest bırakır."""
    while True:
        await asyncio.sleep(60)
        if BUS.counts()["viewers"] == 0 and time.time() - BUS.last_viewer_seen > IDLE_RELEASE_SECONDS:
            with STORE_LOCK:
                ids = list(DATASETS)
            for dataset_id in ids:
                release_dataset(dataset_id, "idle")


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(idle_release_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="PineClinic Local CBCT Service", lifespan=lifespan)

_cors_kwargs: dict[str, object] = {
    "allow_origins": [
        "https://pineclinic.thinpine.com",
        "http://pineclinic.thinpine.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5180",
        "http://127.0.0.1:5180",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "null",
    ],
    "allow_origin_regex": os.environ.get("PINECLINIC_CORS_REGEX", r"https?://.*"),
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "expose_headers": [
        "X-Nx", "X-Ny", "X-Nz",
        "X-Sx", "X-Sy", "X-Sz",
        "X-Origin", "X-Direction",
        "X-Dicom-Meta",
        "X-Segmentation-Schema",
        "X-Clinic-Domain",
        "Content-Length",
    ],
    "max_age": 86400,
}
if "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters:
    _cors_kwargs["allow_private_network"] = True

app.add_middleware(CORSMiddleware, **_cors_kwargs)


@app.middleware("http")
async def security_and_pna_headers(request: Request, call_next):
    """Dış katmanda çalışarak tüm klinik domainlerinden (`https://...`) yerel servise (`127.0.0.1:8000`) PNA/LNA ve CORS erişimini garanti eder."""
    origin = request.headers.get("origin") or "*"
    req_headers = request.headers.get("access-control-request-headers", "*")
    req_method = request.headers.get("access-control-request-method", "GET, POST, PUT, DELETE, OPTIONS")
    response = await call_next(request)
    if request.method == "OPTIONS" and response.status_code >= 400:
        response = Response(status_code=200)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = req_method
        response.headers["Access-Control-Allow-Headers"] = req_headers
        response.headers["Access-Control-Max-Age"] = "86400"
    if "Access-Control-Allow-Origin" not in response.headers and origin:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Access-Control-Allow-Local-Network"] = "true"
    return response


class PathRequest(BaseModel):
    path: str


class PickResult(BaseModel):
    path: str | None = None


# ---- DICOM Serisi Okuma ve Kayıt -------------------------------------------------------------
def read_series(folder: Path) -> tuple[sitk.Image, dict[str, str]]:
    """Klasördeki (ve alt klasörlerindeki) en çok dilime sahip DICOM serisini okur ve ilk dilimden hasta/cihaz meta bilgilerini çıkarır."""
    reader = sitk.ImageSeriesReader()
    candidate_dirs = [folder, *[p for p in folder.rglob("*") if p.is_dir()]]
    best_files: tuple[str, ...] = ()
    for cand in candidate_dirs:
        try:
            ids = reader.GetGDCMSeriesIDs(str(cand))
        except Exception:
            continue
        if not ids:
            continue
        for series_id in ids:
            try:
                fnames = reader.GetGDCMSeriesFileNames(str(cand), series_id)
                if len(fnames) > len(best_files):
                    best_files = tuple(fnames)
            except Exception:
                continue
    if not best_files:
        raise HTTPException(400, "No DICOM series found in the selected folder")
    reader.SetFileNames(best_files)
    image = reader.Execute()
    first_file = Path(best_files[0]) if best_files else None
    meta = extract_dicom_meta(image, first_file)
    return image, meta


def load_path(path: str) -> tuple[sitk.Image, dict[str, str]]:
    """Yerel dosya yolu veya klasörden 3B hacmi ve meta verilerini yükler."""
    p = Path(path).expanduser()
    if not p.exists():
        raise HTTPException(404, f"Path not found: {p}")
    if p.is_file() and p.name.lower().endswith((".nii", ".nii.gz", ".nrrd", ".nhdr", ".mha", ".mhd")):
        image = sitk.ReadImage(str(p))
        return image, extract_dicom_meta(image, None)
    if p.is_file() and p.name.lower().endswith(".dcm"):
        # Tek dosyalı (multiframe) DICOM veya klasör içindeki bir kesit
        try:
            image = sitk.ReadImage(str(p))
            if image.GetDimension() >= 3 and image.GetSize()[2] > 1:
                return image, extract_dicom_meta(image, p)
        except Exception:
            pass
    return read_series(p if p.is_dir() else p.parent)


def path_fingerprint(path: str) -> str:
    """Klasördeki tüm dosyaların ad, boyut ve değiştirilme zamanından SHA-256 parmak izi üretir."""
    p = Path(path).expanduser()
    files = sorted(p.iterdir()) if p.is_dir() else [p]
    digest = hashlib.sha256()
    for file in files:
        if file.is_file():
            stat = file.stat()
            digest.update(f"{file.name}:{stat.st_size}:{stat.st_mtime_ns}".encode())
    return digest.hexdigest()


def register_dataset(
    image: sitk.Image,
    fingerprint: str,
    source: str,
    dicom_meta: dict[str, str] | None = None,
    clinic_domain: str = "local",
) -> tuple[str, Dataset]:
    """Okunan görüntüyü belleğe kaydeder ve bağlı istemcilere `dataset.opened` olayı yayınlar."""
    meta = dicom_meta if dicom_meta is not None else extract_dicom_meta(image, None)
    normalized_domain = _normalize_domain(clinic_domain) or "local"
    with STORE_LOCK:
        dataset_id = uuid.uuid4().hex
        dataset = Dataset(
            image=image,
            fingerprint=fingerprint,
            source=source,
            dicom_meta=meta,
            clinic_domain=normalized_domain,
        )
        DATASETS[dataset_id] = dataset
    BUS.publish("dataset.opened", dataset_summary(dataset_id, dataset))
    return dataset_id, dataset


def get_dataset(dataset_id: str) -> Dataset:
    with STORE_LOCK:
        dataset = DATASETS.get(dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset is no longer available. Open the series again.")
    return dataset


def image_metadata(
    image: sitk.Image,
    dataset_id: str | None = None,
    dicom_meta: dict[str, str] | None = None,
    clinic_domain: str = "local",
) -> dict[str, object]:
    nx, ny, nz = image.GetSize()
    sx, sy, sz = image.GetSpacing()
    result: dict[str, object] = {
        "dimensions": [nx, ny, nz],
        "spacing": [sx, sy, sz],
        "origin": list(image.GetOrigin()),
        "direction": list(image.GetDirection()),
        "dicomMeta": dicom_meta or extract_dicom_meta(image, None),
        "clinicDomain": clinic_domain,
    }
    if dataset_id:
        result["datasetId"] = dataset_id
    return result


def volume_response(dataset: Dataset) -> Response:
    """Hacmi ham int16 bayt dizisi olarak, geometri ve DICOM meta başlıklarıyla döndürür."""
    image = dataset.image
    arr = sitk.GetArrayFromImage(sitk.Cast(image, sitk.sitkInt16))  # z, y, x; telde x en hızlı
    nx, ny, nz = image.GetSize()
    sx, sy, sz = image.GetSpacing()
    origin = ",".join(str(value) for value in image.GetOrigin())
    direction = ",".join(str(value) for value in image.GetDirection())
    meta_b64 = base64.urlsafe_b64encode(json.dumps(dataset.dicom_meta, ensure_ascii=False).encode("utf-8")).decode("ascii")
    return Response(
        content=np.ascontiguousarray(arr).tobytes(),
        media_type="application/octet-stream",
        headers={
            "X-Nx": str(nx), "X-Ny": str(ny), "X-Nz": str(nz),
            "X-Sx": str(sx), "X-Sy": str(sy), "X-Sz": str(sz),
            "X-Origin": origin, "X-Direction": direction,
            "X-Dicom-Meta": meta_b64,
            "X-Clinic-Domain": dataset.clinic_domain,
        },
    )


def mask_response(mask: np.ndarray, schema: str) -> Response:
    """AI segmentasyon maskesini (uint8) ve şema adını (`dental-segmentator-v1`) döndürür."""
    nz, ny, nx = mask.shape
    return Response(
        content=np.ascontiguousarray(mask).tobytes(),
        media_type="application/octet-stream",
        headers={"X-Nx": str(nx), "X-Ny": str(ny), "X-Nz": str(nz), "X-Segmentation-Schema": schema},
    )


# ---- AI Çıkarım Motoru Seçimi ve Arka Plan İşçisi --------------------------------------------
def selected_engine() -> tuple[str, str]:
    """Aktif AI motorunu seçer (DentalSegmentator PyTorch CUDA / MPS / DirectML / CPU)."""
    if ENGINE in {"auto", "dental"} and dental_infer.available():
        return "dental", dental_infer.provider_name()
    return "unavailable", "none"


def run_segmentation(job_id: str) -> None:
    """Arka plan iş parçacığı giriş noktası: işi çalıştırır ve nihai durumunu mutlaka yayınlar."""
    try:
        _run_segmentation(job_id)
    finally:
        with STORE_LOCK:
            job = JOBS.get(job_id)
        if job:
            publish_job(job_id, job)


def _run_segmentation(job_id: str) -> None:
    with STORE_LOCK:
        job = JOBS[job_id]
        dataset = DATASETS.get(job.dataset_id)
        if job.cancel_requested:
            job.state, job.stage, job.finished_at = "cancelled", "cancelled", time.time()
            return
        if not dataset:
            job.state, job.detail, job.finished_at = "failed", "Dataset no longer exists", time.time()
            return
        job.state, job.stage, job.started_at = "running", "preparing volume", time.time()
    engine, provider = selected_engine()
    job.provider = provider
    publish_job(job_id, job)
    if engine == "unavailable":
        with STORE_LOCK:
            job.state, job.detail, job.finished_at = "failed", "No local segmentation engine is installed", time.time()
        return
    try:
        def progress(done: int, total: int, elapsed: float) -> None:
            with STORE_LOCK:
                job.stage = f"AI tile {done}/{total}"
                job.progress = done / max(total, 1)
            publish_job(job_id, job, progress_only=True)

        def cancelled() -> bool:
            with STORE_LOCK:
                return job.cancel_requested

        job.mask_schema = "dental-segmentator-v1"
        mask = dental_infer.segment_dental(dataset.image, log=log, on_progress=progress, is_cancelled=cancelled)
        with STORE_LOCK:
            if job.cancel_requested:
                job.state, job.stage, job.finished_at = "cancelled", "cancelled", time.time()
                return
        with STORE_LOCK:
            job.mask, job.state, job.stage, job.progress, job.finished_at = mask, "done", "complete", 1.0, time.time()
            cache_key = (dataset.clinic_domain, dataset.fingerprint, engine)
            RESULT_CACHE[cache_key] = (mask, job.mask_schema, provider)
            while len(RESULT_CACHE) > 2:
                RESULT_CACHE.popitem(last=False)
    except dental_infer.SegmentationCancelled:
        with STORE_LOCK:
            job.state, job.stage, job.finished_at = "cancelled", "cancelled", time.time()
    except Exception as exc:
        log("segmentation failed", repr(exc))
        with STORE_LOCK:
            job.state, job.detail, job.finished_at = "failed", str(exc)[:500], time.time()


# ---- HTTP ve SSE Uç Noktaları ----------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, object]:
    engine, provider = selected_engine()
    return {
        "status": "ok",
        "localOnly": True,
        "engine": engine,
        "provider": provider,
        "resultCacheEnabled": True,
        "gpuAvailable": dental_infer.gpu_available(),
        "mpsAvailable": dental_infer.mps_available(),
        "instanceId": INSTANCE_ID,
        "apiVersion": API_VERSION,
        "codeVersion": CODE_VERSION,
        "startedAt": STARTED_AT,
        "clients": BUS.counts(),
        "note": "The browser never receives a model. DentalSegmentator runs locally and returns only its segmentation labels.",
    }


@app.get("/api/events")
async def events(request: Request, role: str = "viewer", x_control_token: str | None = Header(None)) -> StreamingResponse:
    """Tarayıcı görüntüleyici ve Electron servis yöneticisi tarafından paylaşılan canlı SSE akışı."""
    if role not in {"viewer", "manager"}:
        raise HTTPException(400, "role must be viewer or manager")
    if role == "manager":
        require_control(x_control_token)
    subscriber_id, queue = BUS.subscribe(role)
    BUS.publish("clients", BUS.counts())

    async def stream():
        try:
            yield sse("hello", snapshot())
            while True:
                try:
                    frame = await asyncio.wait_for(queue.get(), HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    frame = sse("heartbeat", {"t": time.time(), "instanceId": INSTANCE_ID})
                yield frame
                if frame.startswith("event: service.stopping"):
                    break
        finally:
            BUS.unsubscribe(subscriber_id)
            BUS.publish("clients", BUS.counts())

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/pick-folder")
async def pick_folder() -> JSONResponse:
    """Electron yöneticisinden (veya macOS/Windows yerel diyalogdan) klasör seçme penceresini açmasını ister."""
    if BUS.counts()["managers"] == 0:
        if not CONTROL_TOKEN and sys.platform == "darwin":
            def _mac_pick() -> dict[str, object]:
                try:
                    proc = subprocess.run(
                        ["osascript", "-e", 'POSIX path of (choose folder with prompt "CBCT DICOM Serisi Klasörünü Seçin")'],
                        capture_output=True,
                        text=True,
                        timeout=300,
                    )
                    if proc.returncode == 0 and proc.stdout.strip():
                        return {"path": proc.stdout.strip()}
                    return {"cancelled": True}
                except Exception:
                    return {"cancelled": True}

            result = await asyncio.to_thread(_mac_pick)
            return JSONResponse(result)
        if not CONTROL_TOKEN and sys.platform == "win32":
            def _win_pick() -> dict[str, object]:
                try:
                    ps_script = (
                        "Add-Type -AssemblyName System.Windows.Forms; "
                        "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
                        "$f.Description = 'CBCT DICOM Serisi Klasörünü Seçin'; "
                        "$f.ShowNewFolderButton = $false; "
                        "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"
                    )
                    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                    proc = subprocess.run(
                        ["powershell", "-NoProfile", "-STA", "-Command", ps_script],
                        capture_output=True,
                        text=True,
                        timeout=300,
                        creationflags=creationflags,
                    )
                    if proc.returncode == 0 and proc.stdout.strip():
                        return {"path": proc.stdout.strip()}
                    return {"cancelled": True}
                except Exception:
                    return {"cancelled": True}

            result = await asyncio.to_thread(_win_pick)
            return JSONResponse(result)
        return JSONResponse({"reason": "no-manager"}, status_code=409)
    request_id = uuid.uuid4().hex
    future = PICKS.create(request_id)
    BUS.publish("pick-folder.request", {"requestId": request_id}, roles={"manager"})
    try:
        result = await asyncio.wait_for(future, 300)
    except asyncio.TimeoutError:
        result = {"cancelled": True}
    finally:
        PICKS.discard(request_id)
    return JSONResponse(result)


@app.post("/api/control/pick-folder/{request_id}")
async def resolve_pick_folder(request_id: str, body: PickResult, x_control_token: str | None = Header(None)) -> dict[str, bool]:
    require_control(x_control_token)
    result: dict[str, object] = {"path": body.path} if body.path else {"cancelled": True}
    return {"delivered": PICKS.resolve(request_id, result)}


def request_exit() -> None:
    if SERVER is not None:
        SERVER.should_exit = True  # type: ignore[attr-defined]
    else:
        os._exit(0)


@app.post("/api/control/shutdown")
async def control_shutdown(x_control_token: str | None = Header(None)) -> dict[str, str]:
    require_control(x_control_token)
    with STORE_LOCK:
        active = [(job_id, job) for job_id, job in JOBS.items() if job.state in {"queued", "running"}]
        for _, job in active:
            job.cancel_requested = True
    BUS.publish("service.stopping", {"reason": "user", "instanceId": INSTANCE_ID})
    log("shutdown requested by the service manager")
    asyncio.get_running_loop().call_later(0.3, request_exit)
    return {"state": "stopping"}


@app.get("/api/datasets")
def list_datasets(request: Request, all_clinics: bool = False) -> dict[str, object]:
    """İstek yapan kliniğe (`clinic_domain`) ait aktif veri setlerini listeler."""
    clinic_domain = _extract_clinic_domain(request)
    with STORE_LOCK:
        items = [
            dataset_summary(dataset_id, dataset)
            for dataset_id, dataset in DATASETS.items()
            if all_clinics or clinic_domain == "local" or dataset.clinic_domain in {clinic_domain, "local"}
        ]
    return {"clinicDomain": clinic_domain, "datasets": items}


@app.post("/api/datasets/path")
def open_dataset_path(body: PathRequest, request: Request) -> JSONResponse:
    clinic_domain = _extract_clinic_domain(request)
    fingerprint = path_fingerprint(body.path)
    image, dicom_meta = load_path(body.path)
    dataset_id, dataset = register_dataset(
        image,
        fingerprint,
        str(Path(body.path).expanduser()),
        dicom_meta,
        clinic_domain=clinic_domain,
    )
    return JSONResponse({
        **image_metadata(dataset.image, dataset_id, dataset.dicom_meta, dataset.clinic_domain),
        "source": dataset.source,
    })


@app.post("/api/datasets/upload")
async def upload_dataset(request: Request) -> JSONResponse:
    clinic_domain = _extract_clinic_domain(request)
    async with request.form(max_files=50000, max_fields=50000) as form:
        uploads = [item for _, item in form.multi_items() if hasattr(item, "read")]
        if not uploads:
            raise HTTPException(400, "Select at least one DICOM file")
        digest = hashlib.sha256()
        with tempfile.TemporaryDirectory(prefix="pineclinic-upload-") as temp:
            folder = Path(temp)
            for index, upload in enumerate(uploads):
                raw_name = getattr(upload, "filename", None) or f"slice-{index}.dcm"
                rel_parts = [p for p in Path(raw_name.replace("\\", "/")).parts if p not in ("", ".", "..", "/")]
                rel_path = Path(*rel_parts) if rel_parts else Path(f"slice-{index}.dcm")
                target = folder / rel_path
                target.parent.mkdir(parents=True, exist_ok=True)
                data = await upload.read()
                digest.update(str(rel_path).encode())
                digest.update(data)
                target.write_bytes(data)
            image, dicom_meta = read_series(folder)
    dataset_id, dataset = register_dataset(
        image,
        digest.hexdigest(),
        "uploaded DICOM series",
        dicom_meta,
        clinic_domain=clinic_domain,
    )
    return JSONResponse({
        **image_metadata(dataset.image, dataset_id, dataset.dicom_meta, dataset.clinic_domain),
        "source": dataset.source,
    })


@app.get("/api/datasets/{dataset_id}/metadata")
def get_dataset_metadata(dataset_id: str) -> dict[str, object]:
    """Veri setinin geometri ve Meyer/KaVo/NewTom uyumlu DICOM hasta/cihaz meta bilgilerini döndürür."""
    dataset = get_dataset(dataset_id)
    if not dataset.dicom_meta:
        dataset.dicom_meta = extract_dicom_meta(dataset.image, None)
    return image_metadata(dataset.image, dataset_id, dataset.dicom_meta, dataset.clinic_domain)


@app.get("/api/datasets/{dataset_id}/volume")
def get_volume(dataset_id: str) -> Response:
    dataset = get_dataset(dataset_id)
    if not dataset.dicom_meta:
        dataset.dicom_meta = extract_dicom_meta(dataset.image, None)
    return volume_response(dataset)


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: str) -> dict[str, bool]:
    return {"released": release_dataset(dataset_id, "viewer")}


@app.post("/api/datasets/{dataset_id}/jobs/segment")
def start_segmentation(dataset_id: str) -> dict[str, object]:
    dataset = get_dataset(dataset_id)
    job_id = uuid.uuid4().hex
    engine, provider = selected_engine()
    cache_key = (dataset.clinic_domain, dataset.fingerprint, engine)
    with STORE_LOCK:
        job = JOBS[job_id] = Job(dataset_id=dataset_id)
        cached = RESULT_CACHE.get(cache_key)
        if cached:
            mask, schema, cached_provider = cached
            RESULT_CACHE.move_to_end(cache_key)
            job.mask, job.mask_schema, job.provider = mask, schema, cached_provider
            job.state, job.stage, job.progress = "done", "reused exact local result", 1.0
            job.started_at = job.finished_at = time.time()
    publish_job(job_id, job)
    if cached:
        return {"jobId": job_id, "state": "done", "reused": True}
    EXECUTOR.submit(run_segmentation, job_id)
    return {"jobId": job_id, "state": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, object]:
    with STORE_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        return job_summary(job_id, job)


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> dict[str, str]:
    with STORE_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        job.cancel_requested = True
        queued = job.state == "queued"
        if queued:
            job.state, job.stage = "cancelled", "cancelled"
    if queued:
        publish_job(job_id, job)
    else:
        BUS.publish("job.progress", {**job_summary(job_id, job), "stage": "cancelling"})
    return {"state": "cancelling"}


@app.get("/api/jobs/{job_id}/mask")
def get_job_mask(job_id: str) -> Response:
    with STORE_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        if job.state != "done" or job.mask is None:
            raise HTTPException(409, f"Mask is not ready ({job.state})")
        mask = job.mask
    return mask_response(mask, job.mask_schema)


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="PineClinic local CBCT service")
    parser.add_argument("--host", default=os.environ.get("PINECLINIC_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PINECLINIC_PORT", "8000")))
    args = parser.parse_args()
    log(f"Starting local-only service at http://{args.host}:{args.port} (instance {INSTANCE_ID[:8]}, api v{API_VERSION}, code {CODE_VERSION})")
    server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port, log_level="info", timeout_graceful_shutdown=2))
    SERVER = server

    manager_pid = int(os.environ.get("PINECLINIC_MANAGER_PID", "0") or 0)
    if manager_pid and os.name == "posix":
        def _watch_manager() -> None:
            while True:
                time.sleep(2)
                try:
                    os.kill(manager_pid, 0)
                except ProcessLookupError:
                    log("Manager process is gone; shutting down.")
                    os._exit(0)
                except PermissionError:
                    pass
        threading.Thread(target=_watch_manager, daemon=True).start()
    elif manager_pid and sys.platform == "win32":
        def _watch_manager_win() -> None:
            import ctypes
            from ctypes import wintypes

            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            STILL_ACTIVE = 259
            kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
            while True:
                time.sleep(2)
                handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, manager_pid)
                if not handle:
                    log("Manager process is gone (win32); shutting down.")
                    os._exit(0)
                exit_code = wintypes.DWORD()
                ok = kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
                kernel32.CloseHandle(handle)
                if not ok or exit_code.value != STILL_ACTIVE:
                    log("Manager process exited (win32); shutting down.")
                    os._exit(0)
        threading.Thread(target=_watch_manager_win, daemon=True).start()
    server.run()
    os._exit(0)
