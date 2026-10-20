FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=5 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NNUNET_RESULTS=/models/nnUNet_results

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
COPY services/dental-segmentator/requirements.txt ./requirements.txt
# Keep PyTorch separate so a transient PyPI failure while installing nnU-Net
# dependencies does not force Dokploy to download the large CPU wheels again.
RUN pip install --retries 5 --timeout 120 \
    --index-url https://download.pytorch.org/whl/cpu torch torchvision
RUN pip install --retries 5 --timeout 120 --prefer-binary -r requirements.txt
COPY services/dental-segmentator/ ./

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
