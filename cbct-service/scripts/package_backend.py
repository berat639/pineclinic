"""PineClinic Lokal Servisler İçin Bağımsız (Self-Contained) Backend Derleme Betiği.

macOS (Apple Silicon MPS) ve Windows (NVIDIA CUDA + DirectX 12 ONNX DirectML) için PyInstaller
`onedir` paketi üretir. Çıktı paketi Python çalışma zamanını, SimpleITK DICOM okuyucusunu,
PyTorch/ONNX Runtime GPU çalışma zamanını ve `DentalSegmentator` model ağırlıklarını
(`backend/models/dental-segmentator`) tek bir klasörde toplar; son kullanıcının bilgisayarına
Python kurması gerekmez.
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
RELEASE = ROOT / "release" / "backend"


def _maybe_export_onnx() -> None:
    """Windows derlemelerinde veya `--export-onnx` verildiğinde DirectML için 3B ONNX modelini önceden üretir."""
    if sys.platform != "win32" and "--export-onnx" not in sys.argv:
        return
    if importlib.util.find_spec("onnx") is None:
        return
    sys.path.insert(0, str(BACKEND))
    try:
        import dental_infer  # type: ignore

        onnx_path = dental_infer.export_onnx_model(log=lambda *a: print("[package_backend]", *a, flush=True))
        if onnx_path:
            print(f"[package_backend] ONNX DirectML modeli hazır: {onnx_path}", flush=True)
    except Exception as exc:
        print(f"[package_backend] ONNX dışa aktarma uyarısı (çalışma zamanında üretilecek): {exc}", flush=True)


def main() -> None:
    model_dir = BACKEND / "models" / "dental-segmentator"
    checkpoint = next(model_dir.glob("**/fold_0/checkpoint_final.pth"), None) if model_dir.exists() else None
    if not checkpoint:
        raise SystemExit("Eksik AI modeli: backend/models/dental-segmentator/**/fold_0/checkpoint_final.pth bulunamadı")
    _maybe_export_onnx()
    RELEASE.mkdir(parents=True, exist_ok=True)
    command = [
        # Tek dosyalı (`onefile`) derleme her açılışta yüzlerce MB ağırlığı geçici klasöre
        # açtığı için başlatmayı geciktirir; `onedir` masaüstü paketi içinde anında açılır.
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
        "--name", "pineclinic-local-services",
        "--distpath", str(RELEASE),
        "--workpath", str(ROOT / "build" / "pyinstaller"),
        "--specpath", str(ROOT / "build"),
        "--add-data", f"{BACKEND / 'models'}{';' if sys.platform == 'win32' else ':'}models",
        "--collect-all", "SimpleITK",
        "--collect-all", "nnunetv2",
        "--collect-all", "dynamic_network_architectures",
        "--paths", str(BACKEND),
        "--hidden-import", "sync",
        "--hidden-import", "dental_infer",
        "--hidden-import", "dateutil",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops.auto",
    ]
    if importlib.util.find_spec("onnxruntime") is not None:
        command.extend(["--collect-all", "onnxruntime"])
    command.append(str(BACKEND / "main.py"))
    subprocess.run(command, check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
