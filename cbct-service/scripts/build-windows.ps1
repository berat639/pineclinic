# PineClinic Lokal Servisler — Windows 10/11 Tek Komutlu Paketleme Betiği (CUDA 12.4 + DirectX 12 DirectML)
# Çalıştırma: powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "[PineClinic] 1/5 Python sanal ortamı hazırlanıyor..." -ForegroundColor Cyan
$VenvDir = Join-Path $Root "backend\.venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    python -m venv $VenvDir
}

Write-Host "[PineClinic] 2/5 Windows GPU bağımlılıkları (PyTorch CUDA 12.4 + ONNX Runtime DirectML) kuruluyor..." -ForegroundColor Cyan
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $Root "backend\requirements-windows.txt")

Write-Host "[PineClinic] 3/5 PyInstaller ile bağımsız backend ve 3B ONNX DirectML modeli derleniyor..." -ForegroundColor Cyan
& $VenvPython (Join-Path $Root "scripts\package_backend.py") --export-onnx

Write-Host "[PineClinic] 4/5 Electron & NSIS Setup (PineClinic-Lokal-Servisler-Setup.exe) oluşturuluyor..." -ForegroundColor Cyan
npm install
npx electron-builder --win --x64

$ExeSource = Join-Path $Root "dist\PineClinic-Lokal-Servisler-Setup.exe"
$ClientDownloads = Join-Path (Split-Path -Parent $Root) "client\public\downloads"
if (Test-Path (Split-Path -Parent $ClientDownloads)) {
    New-Item -ItemType Directory -Force -Path $ClientDownloads | Out-Null
    $ExeDest = Join-Path $ClientDownloads "PineClinic-Lokal-Servisler-Setup.exe"
    Copy-Item -Path $ExeSource -Destination $ExeDest -Force
    Write-Host "[PineClinic] 5/5 Kurulum dosyası kopyalandı: $ExeDest" -ForegroundColor Green
} else {
    Write-Host "[PineClinic] 5/5 Kurulum dosyası hazır: $ExeSource" -ForegroundColor Green
}

