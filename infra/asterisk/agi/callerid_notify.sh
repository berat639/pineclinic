#!/bin/bash
# AGI script: voiceai-server'a arayan numarasını AudioSocket UUID ile kaydet.
# AudioSocket bağlantısından ÖNCE çalışır; curl senkron (max 2s timeout).
# Args: $1=audiosocket_uuid, $2=callerid_num

# AGI protokolü: stdin'den header satırlarını oku (boş satıra kadar)
while IFS= read -r line; do
  line="${line%$'\r'}"
  [ -z "$line" ] && break
done

UUID="${1:-}"
CALLER="${2:-}"
CHANNEL="${3:-}"
DIRECTION="${4:-inbound}"

if [ -n "$UUID" ] && [ -n "$CALLER" ]; then
  HOST="${AUDIOSOCKET_HOST:-voiceai-server}"
  PORT="${BACKEND_HTTP_PORT:-3001}"
  curl -sf --max-time 2 \
    "http://${HOST}:${PORT}/api/telephony/register?uuid=${UUID}&caller=${CALLER}&channel=${CHANNEL}&direction=${DIRECTION}" \
    >/dev/null 2>&1 || true
fi

# AGI başarı yanıtı (zorunlu)
echo "200 result=0"
