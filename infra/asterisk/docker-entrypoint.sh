#!/usr/bin/env bash
# Asterisk entrypoint: pjsip.conf'u env değişkenleriyle render eder, sonra asterisk'i çalıştırır.
set -euo pipefail

: "${NETGSM_SIP_HOST:=sip.netgsm.com.tr}"
: "${NETGSM_SIP_PORT:=5060}"
: "${NETGSM_SIP_TRANSPORT:=tcp}"
: "${NETGSM_SIP_USER:?NETGSM_SIP_USER env değişkeni zorunlu (örn. 312XXXXXXX, başında 0 yok)}"
: "${NETGSM_SIP_PASSWORD:?NETGSM_SIP_PASSWORD env değişkeni zorunlu}"
: "${NETGSM_PUBLIC_IP:?NETGSM_PUBLIC_IP env değişkeni zorunlu (sunucunun public IP'si)}"
: "${AUDIOSOCKET_HOST:=voiceai-server}"
: "${AUDIOSOCKET_PORT:=12000}"
: "${RTP_START:=10000}"
: "${RTP_END:=10200}"

export NETGSM_SIP_HOST NETGSM_SIP_PORT NETGSM_SIP_TRANSPORT \
       NETGSM_SIP_USER NETGSM_SIP_PASSWORD NETGSM_PUBLIC_IP \
       AUDIOSOCKET_HOST AUDIOSOCKET_PORT RTP_START RTP_END

TEMPLATE_DIR=/etc/asterisk-templates
TARGET_DIR=/etc/asterisk

for f in pjsip.conf extensions.conf rtp.conf; do
    if [ -f "${TEMPLATE_DIR}/${f}.tmpl" ]; then
        envsubst < "${TEMPLATE_DIR}/${f}.tmpl" > "${TARGET_DIR}/${f}"
        echo "[entrypoint] Rendered ${TARGET_DIR}/${f}"
    fi
done

exec "$@"
