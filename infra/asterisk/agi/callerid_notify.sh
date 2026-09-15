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
DID="${5:-}"
DNID="${6:-}"
TENANT_HOSTNAME="${TELEPHONY_CLINIC_HOSTNAME:-pineclinic.thinpine.com}"

# Comma-separated mapping: 8503096119=pineclinic.thinpine.com,85031234567=guneyagizvedissagligi.com
# The first matching DID wins. This keeps clinic routing in deployment config,
# without putting clinic decisions in the application code.
LOOKUP_NUMBER="${DNID:-$DID}"
IFS=',' read -r -a DID_ENTRIES <<< "${TELEPHONY_DID_MAP:-}"
for entry in "${DID_ENTRIES[@]}"; do
  key="${entry%%=*}"
  value="${entry#*=}"
  if [ -n "$key" ] && [ "$key" = "$LOOKUP_NUMBER" ] && [ -n "$value" ] && [ "$value" != "$entry" ]; then
    TENANT_HOSTNAME="$value"
    break
  fi
done

if [ -n "$UUID" ] && [ -n "$CALLER" ]; then
  HOST="${AUDIOSOCKET_HOST:-voiceai-server}"
  PORT="${BACKEND_HTTP_PORT:-3001}"
  curl -sf --max-time 2 \
    "http://${HOST}:${PORT}/api/telephony/register?uuid=${UUID}&caller=${CALLER}&channel=${CHANNEL}&direction=${DIRECTION}&hostname=${TENANT_HOSTNAME}&did=${LOOKUP_NUMBER}" \
    >/dev/null 2>&1 || true
fi

# AGI başarı yanıtı (zorunlu)
echo "200 result=0"
