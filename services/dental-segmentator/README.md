# DentalSegmentator arch service

This optional service returns a compact dental arch for the CPR viewer. The
default `DENTAL_SEGMENTATOR_MODE=fast` path samples a small axial slab and
returns in seconds on CPU. Set `DENTAL_SEGMENTATOR_MODE=full` to run the
official DentalSegmentator nnU-Net v2 weights against the complete volume.
It does not return or permanently store the source DICOM series.

The first start downloads the 229.7 MB model from the official Zenodo record.
Inference is serialized so two full 3D jobs cannot exhaust RAM simultaneously.
The official extension recommends 32 GB RAM on Linux; CPU inference can take
up to an hour. A CUDA image/runtime should be used for production throughput.

Start the optional service with the application stack:

```sh
docker compose --profile dental-ai up -d dental-segmentator
```

For local service development:

```sh
cd services/dental-segmentator
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
NNUNET_RESULTS="$PWD/models/nnUNet_results" python download-model.py
NNUNET_RESULTS="$PWD/models/nnUNet_results" uvicorn app:app --reload
```

The browser button is `Araçlar → DentalSegmentator`. It uploads the selected
CBCT series, polls the queued job, then replaces the current CPR arch and its
perpendicular section angle with the model-derived result.
