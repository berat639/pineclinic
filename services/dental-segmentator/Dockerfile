FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NNUNET_RESULTS=/models/nnUNet_results

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
COPY services/dental-segmentator/requirements.txt ./requirements.txt
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision && \
    pip install -r requirements.txt
COPY services/dental-segmentator/ ./

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
