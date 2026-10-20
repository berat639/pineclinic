#!/bin/bash
# Signed AGI -> backend call registration. Fail closed on network or routing errors.
while IFS= read -r line; do
  line="${line%$'\r'}"
  [ -z "$line" ] && break
done
UUID="${1:-}"
CALLER="${2:-}"
CHANNEL="${3:-}"
DIRECTION="${4:-inbound}"
DID="${6:-${5:-}}"
CLINIC_ID="${7:-}"
TEST_ID="${8:-}"
ENDPOINT="${9:-}"
TIMESTAMP="$(date +%s)"
KEY="${ASTERISK_AMI_SECRET:-}"
setvar() {
  printf 'SET VARIABLE %s "%s"\n' "$1" "$2"
  IFS= read -r _response
}
setvar AI_AUTHORIZED 0
[ -n "$KEY" ] && [ -n "$UUID" ] && [ -n "$CALLER" ] || exit 0
PAYLOAD="${UUID}|${CALLER}|${CHANNEL}|${DIRECTION}|${DID}|${ENDPOINT}|${CLINIC_ID}|${TEST_ID}|${TIMESTAMP}"
SIGNATURE="$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$KEY" | awk '{print $NF}')"
PATH_NAME=register
[ "$DIRECTION" = transfer ] && PATH_NAME=transfer-result
RESPONSE=$(curl -sfG --max-time 5 \
  --data-urlencode "uuid=$UUID" --data-urlencode "caller=$CALLER" \
  --data-urlencode "channel=$CHANNEL" --data-urlencode "direction=$DIRECTION" \
  --data-urlencode "did=$DID" --data-urlencode "endpoint=$ENDPOINT" \
  --data-urlencode "clinicId=$CLINIC_ID" --data-urlencode "testId=$TEST_ID" \
  --data-urlencode "timestamp=$TIMESTAMP" --data-urlencode "signature=$SIGNATURE" \
  "http://${AUDIOSOCKET_HOST:-voiceai-server}:${BACKEND_HTTP_PORT:-3001}/api/telephony/${PATH_NAME}" 2>/dev/null) || exit 0
printf '%s' "$RESPONSE" | grep -q '"ok":true' || exit 0
MAX_ACTIVE=$(printf '%s' "$RESPONSE" | sed -n 's/.*"maxActiveCalls":\([0-9][0-9]*\).*/\1/p')
QUEUE_GROUP=$(printf '%s' "$RESPONSE" | sed -n 's/.*"queueGroup":"\([a-zA-Z0-9_]*\)".*/\1/p')
RESOLVED_CLINIC=$(printf '%s' "$RESPONSE" | sed -n 's/.*"clinicId":"\([a-f0-9-]*\)".*/\1/p')
case "$MAX_ACTIVE" in 2|3|4|5) ;; *) MAX_ACTIVE=3 ;; esac
setvar AI_AUTHORIZED 1
setvar AI_MAX_ACTIVE "$MAX_ACTIVE"
setvar AI_QUEUE_GROUP "$QUEUE_GROUP"
setvar VOICEAI_CLINIC_ID "$RESOLVED_CLINIC"
