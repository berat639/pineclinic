from __future__ import annotations

import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

URL = os.getenv(
    "DENTAL_SEGMENTATOR_MODEL_URL",
    "https://zenodo.org/api/records/10829675/files/Dataset112_DentalSegmentator_v100.zip/content",
)
ROOT = Path(os.getenv("NNUNET_RESULTS", "/models/nnUNet_results"))
DATASET = "Dataset112_DentalSegmentator_v100"

ROOT.mkdir(parents=True, exist_ok=True)
target = ROOT / DATASET
if target.is_dir():
    print(f"Model already installed: {target}")
    raise SystemExit(0)

with tempfile.TemporaryDirectory() as temporary:
    archive = Path(temporary) / "model.zip"
    print(f"Downloading DentalSegmentator model to {archive}")
    with urllib.request.urlopen(URL, timeout=120) as response, archive.open("wb") as output:
        shutil.copyfileobj(response, output)
    extracted = Path(temporary) / "extracted"
    extracted.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(extracted)
    candidates = [extracted / DATASET, *extracted.glob(f"**/{DATASET}")]
    source = next((candidate for candidate in candidates if candidate.is_dir()), None)
    if source is None:
        raise RuntimeError(f"Archive does not contain expected model folder: {DATASET}")
    shutil.move(str(source), str(target))

if not target.is_dir():
    raise RuntimeError(f"Model installation failed: {target}")
print(f"Installed DentalSegmentator model: {target}")
