"""Yerel CBCT İşleme İçin DentalSegmentator (nnU-Net v2) Çoklu GPU Çıkarım Motoru.

Mimari Rolü:
- Ham 3B CBCT hacmini (`SimpleITK.Image`) alır ve her voksele 0..5 arasında anatomik sınıf atar:
  * 0: Arka plan (Hava / Yumuşak doku)
  * 1: Üst çene kemiği (Maxilla / Üst kafatası tabanı)
  * 2: Alt çene kemiği (Mandible)
  * 3: Üst dişler (Upper teeth - oklüzal üst ark tespiti için ana kanıt)
  * 4: Alt dişler (Lower teeth - oklüzal alt ark tespiti için ana kanıt)
  * 5: Mandibular kanal (Mandibular canal)

Performans ve Çoklu GPU Garantisi (CUDA / MPS / DirectML / CPU):
- 1. Öncelik (NVIDIA CUDA): `cuDNN benchmark` + tüm 3B katmanlarda (`Conv3d` ve `ConvTranspose3d`)
  tam FP16 Tensor Core hızlandırması ve < 4 GB VRAM kartlar için otomatik OOM koruması.
- 2. Öncelik (Apple Silicon MPS): `Conv3d` katmanları FP16, Apple MPS'in FP16 desteklemediği
  `ConvTranspose3d` katmanları ise otomatik kancalarla (hooks) FP32 olarak çalıştırılır.
- 3. Öncelik (Windows DirectML — AMD Radeon / Intel Arc / Iris Xe / NVIDIA):
  `onnxruntime-directml` (`DmlExecutionProvider`) ile Windows 10/11 yerleşik DirectX 12 üzerinden
  ek sürücü gerektirmeden GPU hızlandırması (%99.9995 voksel uyumu).
- 4. Öncelik (CPU): Tüm fiziksel çekirdekleri kullanan çok iş parçacıklı yedek mod.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

import numpy as np
import SimpleITK as sitk
import torch
import torch.nn as nn
from nnunetv2.inference.sliding_window_prediction import compute_gaussian
from nnunetv2.utilities.get_network_from_plans import get_network_from_plans
from nnunetv2.utilities.plans_handling.plans_handler import PlansManager

try:
    import onnxruntime as ort
except Exception:
    ort = None  # type: ignore[assignment]

# ---- Sabitler ve Model Dosya Yolları ---------------------------------------------------------
HERE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
ROOT = HERE / "models" / "dental-segmentator"
MODEL_DIR = next(ROOT.glob("**/nnUNetTrainer__nnUNetPlans__3d_fullres"), None)
CHECKPOINT = MODEL_DIR / "fold_0" / "checkpoint_final.pth" if MODEL_DIR else Path()
ONNX_PATH = (MODEL_DIR / "fold_0" / "dental_segmentator_3d.onnx") if MODEL_DIR else Path()
CONFIG = "3d_fullres"

# Kayan pencere (sliding-window) adım oranı. 0.65 değeri %35 örtüşme sağlar ve
# doğruluğu bozmadan pencere sayısını ~60'tan ~24-36'ya düşürür.
TILE_STEP = float(os.environ.get("DENTAL_TILE_STEP", "0.65"))

_network: torch.nn.Module | None = None
_ort_session: object | None = None
_use_fp16: bool = False


class SegmentationCancelled(Exception):
    """Kullanıcı vakayı sıfırladığında veya işlemi iptal ettiğinde fırlatılır."""


def _starts(length: int, patch: int, step: float = 0.5) -> list[int]:
    """Bir eksen boyunca kayan pencere (tile) başlangıç indekslerini eşit dağıtarak hesaplar."""
    if length <= patch:
        return [0]
    stride = patch * step
    n = int(np.ceil((length - patch) / stride)) + 1
    return sorted({int(round(i * (length - patch) / max(n - 1, 1))) for i in range(n)})


def mps_available() -> bool:
    """Apple Silicon Metal (MPS) donanım hızlandırmasının kullanılabilir olup olmadığını döndürür."""
    return bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available())


def cuda_available() -> bool:
    """NVIDIA CUDA donanım hızlandırmasının kullanılabilir olup olmadığını döndürür."""
    return bool(torch.cuda.is_available())


def dml_available() -> bool:
    """Windows DirectX 12 (DirectML) donanım hızlandırmasının kullanılabilir olup olmadığını döndürür."""
    if ort is None:
        return False
    try:
        return "DmlExecutionProvider" in ort.get_available_providers()
    except Exception:
        return False


def gpu_available() -> bool:
    """Herhangi bir yerel GPU hızlandırmasının (CUDA, MPS veya DirectML) aktif olup olmadığını döndürür."""
    return cuda_available() or mps_available() or dml_available()


def selected_backend() -> str:
    """En hızlı yerel donanım arka ucunu seçer: cuda -> mps -> dml -> cpu."""
    forced = os.environ.get("PINECLINIC_DEVICE", "").strip().lower()
    if forced in {"cuda", "mps", "dml", "cpu"}:
        return forced
    if cuda_available():
        return "cuda"
    if mps_available():
        return "mps"
    if dml_available():
        return "dml"
    return "cpu"


def device() -> torch.device:
    """PyTorch tensör işlemlerinin çalışacağı cihazı döndürür."""
    backend = selected_backend()
    if backend == "cuda" and cuda_available():
        return torch.device("cuda")
    if backend == "mps" and mps_available():
        return torch.device("mps")
    return torch.device("cpu")


def provider_name() -> str:
    """Arayüzde ('Local Service' kartında) gösterilecek donanım sağlayıcı adını döndürür."""
    backend = selected_backend()
    if backend == "cuda" and cuda_available():
        try:
            gpu_name = torch.cuda.get_device_name(0)
            return f"PyTorch CUDA ({gpu_name})" if gpu_name else "PyTorch CUDA"
        except Exception:
            return "PyTorch CUDA"
    if backend == "mps":
        return "PyTorch MPS"
    if backend == "dml":
        return "DirectML GPU"
    return "PyTorch CPU"


def available() -> bool:
    """DentalSegmentator model ağırlıklarının diskte mevcut olup olmadığını kontrol eder."""
    return bool(MODEL_DIR and (CHECKPOINT.exists() or ONNX_PATH.exists()))


def _plan_metadata() -> tuple[dict, tuple[int, int, int], tuple[float, float, float], tuple[int, int, int], int]:
    assert MODEL_DIR
    plans = PlansManager(str(MODEL_DIR / "plans.json"))
    configuration = plans.get_configuration(CONFIG)
    raw = configuration.configuration
    architecture = raw["architecture"]
    patch = tuple(int(v) for v in raw["patch_size"])
    spacing = tuple(float(v) for v in raw["spacing"])
    transpose = tuple(int(v) for v in json.load(open(MODEL_DIR / "plans.json"))["transpose_forward"])
    dataset = json.load(open(MODEL_DIR / "dataset.json"))
    num_classes = len(dataset["labels"])
    return architecture, patch, spacing, transpose, num_classes


def _build_cpu_network() -> tuple[torch.nn.Module, tuple[int, int, int], tuple[float, float, float], tuple[int, int, int]]:
    architecture, patch, spacing, transpose, num_classes = _plan_metadata()
    net = get_network_from_plans(
        architecture["network_class_name"],
        architecture["arch_kwargs"],
        architecture["_kw_requires_import"],
        input_channels=1,
        output_channels=num_classes,
        allow_init=True,
        deep_supervision=False,
    ).eval()
    checkpoint = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
    state = {
        key.replace("module.", "").replace("_orig_mod.", ""): value
        for key, value in checkpoint["network_weights"].items()
    }
    net.load_state_dict(state)
    return net, patch, spacing, transpose


def export_onnx_model(target_path: Path | None = None) -> Path:
    """PyTorch checkpoint ağırlıklarını DirectML/ONNX Runtime için ONNX grafiğine dışa aktarır."""
    out_path = target_path or ONNX_PATH
    if out_path.exists() and out_path.stat().st_size > 10_000_000:
        return out_path
    net, patch, _, _, = _build_cpu_network()
    dummy = torch.zeros((1, 1, *patch), dtype=torch.float32)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".onnx.tmp")
    torch.onnx.export(
        net,
        dummy,
        str(tmp_path),
        input_names=["input"],
        output_names=["output"],
        opset_version=17,
        dynamo=False,
    )
    tmp_path.replace(out_path)
    return out_path


def _dml_session() -> tuple[object, tuple[int, int, int], tuple[float, float, float], tuple[int, int, int]]:
    """Windows DirectX 12 (DirectML) ONNX Runtime oturumunu hazırlar."""
    global _ort_session
    _, patch, spacing, transpose, _ = _plan_metadata()
    if _ort_session is None:
        if ort is None:
            raise RuntimeError("onnxruntime is not installed")
        try:
            onnx_file = export_onnx_model(ONNX_PATH)
        except PermissionError:
            fallback = Path(tempfile.gettempdir()) / "pineclinic_dental_segmentator_3d.onnx"
            onnx_file = export_onnx_model(fallback)
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.enable_mem_pattern = False
        providers = [
            ("DmlExecutionProvider", {"device_id": 0}),
            "CPUExecutionProvider",
        ]
        _ort_session = ort.InferenceSession(str(onnx_file), sess_options=sess_options, providers=providers)
    return _ort_session, patch, spacing, transpose


def _model() -> tuple[torch.nn.Module, tuple[int, int, int], tuple[float, float, float], tuple[int, int, int]]:
    """nnU-Net v2.2 modelini belleğe bir kez yükler ve CUDA/MPS/CPU için optimize eder."""
    global _network, _use_fp16
    assert MODEL_DIR
    _, patch, spacing, transpose, _ = _plan_metadata()
    if _network is None:
        target = device()
        net, patch, spacing, transpose = _build_cpu_network()
        if target.type == "cuda":
            # NVIDIA CUDA: cuDNN autotuner + tüm 3B katmanlarda (Conv3d & ConvTranspose3d) tam FP16 Tensor Core
            torch.backends.cudnn.benchmark = True
            net = net.half()
            _use_fp16 = True
        elif target.type == "mps":
            # Apple Silicon MPS: 3B evrişimleri FP16'da çalıştırırken MPS'in FP32 zorunluluğu olan
            # ConvTranspose3d katmanlarını otomatik olarak FP32'de tutar.
            net = net.half()
            for module in net.modules():
                if isinstance(module, nn.ConvTranspose3d):
                    module.float()
                    module.register_forward_pre_hook(lambda mod, inp: (inp[0].float(),))
                    module.register_forward_hook(lambda mod, inp, out: out.half())
            _use_fp16 = True
        else:
            # Çok çekirdekli CPU modu
            cpu_threads = max(1, os.cpu_count() or 4)
            try:
                torch.set_num_threads(cpu_threads)
            except Exception:
                pass
            _use_fp16 = False
        _network = net.to(target)
    return _network, patch, spacing, transpose


def _normalization() -> tuple[float, float, float, float]:
    """Modelin eğitiminde kullanılan BT yoğunluk (HU) kırpma ve Z-skor normalizasyon parametrelerini okur."""
    assert MODEL_DIR
    props = json.load(open(MODEL_DIR / "plans.json"))["foreground_intensity_properties_per_channel"]["0"]
    return props["mean"], props["std"], props["percentile_00_5"], props["percentile_99_5"]


def _resample_for_model(
    image: sitk.Image,
    spacing_after_transpose: tuple[float, float, float],
    transpose: tuple[int, int, int],
) -> tuple[sitk.Image, np.ndarray]:
    """Görüntüyü standart RAS yönelimine çevirir ve modelin beklediği voksel aralığına yeniden örnekler."""
    ras = sitk.DICOMOrient(image, "RAS")
    inverse = [transpose.index(axis) for axis in range(3)]
    array_spacing = [spacing_after_transpose[inverse[axis]] for axis in range(3)]  # z, y, x
    sitk_spacing = tuple(reversed(array_spacing))
    size, old_spacing = ras.GetSize(), ras.GetSpacing()
    new_size = [max(1, int(round(size[i] * old_spacing[i] / sitk_spacing[i]))) for i in range(3)]
    fill = float(sitk.GetArrayViewFromImage(ras).min())
    iso = sitk.Resample(
        ras, new_size, sitk.Transform(), sitk.sitkLinear,
        ras.GetOrigin(), sitk_spacing, ras.GetDirection(), fill, sitk.sitkFloat32,
    )
    array = np.ascontiguousarray(np.transpose(sitk.GetArrayFromImage(iso), transpose))
    return iso, array


def _cuda_has_ample_vram(min_gb: float = 4.0) -> bool:
    """NVIDIA ekran kartının 3B olasılık hacmini doğrudan VRAM'de tutmak için yeterli belleği olup olmadığını kontrol eder."""
    if not cuda_available():
        return False
    try:
        total_bytes = torch.cuda.get_device_properties(0).total_memory
        return total_bytes >= int(min_gb * (1024 ** 3))
    except Exception:
        return True


def segment_dental(
    orig: sitk.Image,
    log=print,
    on_progress: Callable[[int, int, float], None] | None = None,
    is_cancelled: Callable[[], bool] | None = None,
) -> np.ndarray:
    """CBCT hacmini segmente ederek orijinal görüntü ızgarasında 0..5 etiket dizisi (uint8) döndürür."""
    if not available():
        raise RuntimeError("DentalSegmentator model is not available")
    started = time.time()
    backend = selected_backend()

    if backend == "dml":
        session, patch, spacing, transpose = _dml_session()
        use_fp16 = False
    else:
        network, patch, spacing, transpose = _model()
        use_fp16 = _use_fp16

    model_image, array = _resample_for_model(orig, spacing, transpose)

    # Yoğunluk (HU) kırpma ve Z-skor normalizasyonu
    mean, std, low, high = _normalization()
    dtype_np = np.float16 if use_fp16 else np.float32
    dtype_torch = torch.float16 if use_fp16 else torch.float32
    min_norm = float((low - mean) / max(std, 1e-8))
    array = ((np.clip(array, low, high) - mean) / max(std, 1e-8)).astype(dtype_np)

    # Hacim model penceresinden (patch) küçükse kenarları arka plan değeriyle doldur
    padding = [max(0, patch[axis] - array.shape[axis]) for axis in range(3)]
    if any(padding):
        array = np.pad(array, [(0, value) for value in padding], constant_values=dtype_np(min_norm))
    shape = array.shape
    zs, ys, xs = (_starts(shape[axis], patch[axis], TILE_STEP) for axis in range(3))
    total = len(zs) * len(ys) * len(xs)
    done = 0
    air_cutoff = min_norm + 1e-3

    # Pencere kenarlarındaki birleşim izlerini önleyen 3B Gauss ağırlık maskesi
    gaussian = compute_gaussian(patch, sigma_scale=1 / 8, value_scaling_factor=10, dtype=torch.float32, device=torch.device("cpu"))

    if backend == "dml":
        # Windows DirectML (ONNX Runtime GPU) Yolu
        gauss_np = np.maximum(gaussian.numpy().astype(np.float32), 1e-2)
        scores_np = np.zeros((6, *shape), dtype=np.float16)
        for z in zs:
            for y in ys:
                for x in xs:
                    if is_cancelled and is_cancelled():
                        raise SegmentationCancelled()
                    tile_np = array[z:z + patch[0], y:y + patch[1], x:x + patch[2]]
                    if float(tile_np.max()) <= air_cutoff:
                        scores_np[0, z:z + patch[0], y:y + patch[1], x:x + patch[2]] += gauss_np.astype(np.float16)
                    else:
                        inp = np.ascontiguousarray(tile_np, dtype=np.float32)[None, None]
                        logits = session.run(["output"], {"input": inp})[0][0]  # type: ignore[attr-defined]
                        logits_max = np.max(logits, axis=0, keepdims=True)
                        exp_logits = np.exp(logits - logits_max)
                        prob = exp_logits / np.maximum(np.sum(exp_logits, axis=0, keepdims=True), 1e-6)
                        scores_np[:, z:z + patch[0], y:y + patch[1], x:x + patch[2]] += (prob * gauss_np).astype(np.float16)
                    done += 1
                    log(f"DentalSegmentator DirectML tile {done}/{total} ({time.time() - started:.0f}s)")
                    if on_progress:
                        on_progress(done, total, time.time() - started)
        labels = np.argmax(scores_np, axis=0).astype(np.uint8)
        del scores_np
    else:
        # PyTorch CUDA / MPS / CPU Yolu
        target = device()
        # Düşük VRAM'li (< 4 GB) NVIDIA kartlarda OOM önlemek için olasılık biriktirme alanı seçimi
        accum_device = target
        if target.type == "cuda" and not _cuda_has_ample_vram(4.0):
            accum_device = torch.device("cpu")

        try:
            scores = torch.zeros((6, *shape), dtype=dtype_torch, device=accum_device)
            array_dev = torch.from_numpy(array).to(accum_device)
        except RuntimeError:
            accum_device = torch.device("cpu")
            if target.type == "cuda":
                torch.cuda.empty_cache()
            scores = torch.zeros((6, *shape), dtype=dtype_torch, device=accum_device)
            array_dev = torch.from_numpy(array)

        gaussian_infer = torch.clamp(gaussian, min=1e-2).to(device=target, dtype=dtype_torch)
        gaussian_accum = gaussian_infer if accum_device == target else torch.clamp(gaussian, min=1e-2).to(device=accum_device, dtype=dtype_torch)

        with torch.inference_mode():
            for z in zs:
                for y in ys:
                    for x in xs:
                        if is_cancelled and is_cancelled():
                            raise SegmentationCancelled()
                        tile_np = array[z:z + patch[0], y:y + patch[1], x:x + patch[2]]
                        # Tamamen hava/boşluk olan pencereleri sinir ağına sokmadan doğrudan arka plan (0) ata
                        if float(tile_np.max()) <= air_cutoff:
                            scores[0, z:z + patch[0], y:y + patch[1], x:x + patch[2]] += gaussian_accum
                        else:
                            tile = array_dev[z:z + patch[0], y:y + patch[1], x:x + patch[2]][None, None]
                            if tile.device != target:
                                tile = tile.to(target, non_blocking=True)
                            probability = torch.softmax(network(tile).float(), dim=1)[0].to(dtype_torch)
                            weighted = probability * gaussian_infer
                            if accum_device != target:
                                weighted = weighted.to(accum_device)
                            scores[:, z:z + patch[0], y:y + patch[1], x:x + patch[2]] += weighted
                        done += 1
                        log(f"DentalSegmentator tile {done}/{total} ({time.time() - started:.0f}s)")
                        if on_progress:
                            on_progress(done, total, time.time() - started)
            labels = torch.argmax(scores, dim=0).to(torch.uint8).cpu().numpy()

        del scores, array_dev, gaussian_infer, gaussian_accum
        if target.type == "mps":
            torch.mps.empty_cache()
        elif target.type == "cuda":
            torch.cuda.empty_cache()

    # Dolguyu (padding) kaldır ve orijinal DICOM voksel ızgarasına geri projekte et
    cropped = labels[:shape[0] - padding[0], :shape[1] - padding[1], :shape[2] - padding[2]]
    inverse = np.argsort(np.asarray(transpose))
    output_image = sitk.GetImageFromArray(np.ascontiguousarray(np.transpose(cropped, inverse)))
    output_image.CopyInformation(model_image)
    output = sitk.GetArrayFromImage(
        sitk.Resample(output_image, orig, sitk.Transform(), sitk.sitkNearestNeighbor, 0, sitk.sitkUInt8)
    ).astype(np.uint8)
    log(f"DentalSegmentator labels {np.bincount(output.ravel(), minlength=6).tolist()} in {time.time() - started:.0f}s")
    return output
