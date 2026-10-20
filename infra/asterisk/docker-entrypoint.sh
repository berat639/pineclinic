#!/bin/sh
# Asterisk entrypoint: pjsip.conf'u env degiskenleriyle render eder
set -eu

: "${NETGSM_SIP_HOST:=sip.netgsm.com.tr}"
: "${NETGSM_SIP_PORT:=5060}"
: "${NETGSM_SIP_TRANSPORT:=tcp}"
: "${NETGSM_SIP_USER:=}"
: "${NETGSM_SIP_PASSWORD:=}"
: "${NETGSM_PUBLIC_IP:?NETGSM_PUBLIC_IP zorunlu - sunucu public IP adresi}"
: "${AUDIOSOCKET_HOST:=voiceai-server}"
: "${AUDIOSOCKET_PORT:=12000}"
: "${BACKEND_HTTP_PORT:=3001}"
: "${RTP_START:=10000}"
: "${RTP_END:=10200}"
: "${ASTERISK_AMI_SECRET:=pineclinic_ami_secret_123}"

export NETGSM_SIP_HOST NETGSM_SIP_PORT NETGSM_SIP_TRANSPORT \
       NETGSM_SIP_USER NETGSM_SIP_PASSWORD NETGSM_PUBLIC_IP \
       AUDIOSOCKET_HOST AUDIOSOCKET_PORT BACKEND_HTTP_PORT RTP_START RTP_END \
       ASTERISK_AMI_SECRET

TEMPLATE_DIR=/etc/asterisk-templates
TARGET_DIR=/etc/asterisk

for f in pjsip.conf extensions.conf rtp.conf manager.conf; do
    if [ -f "${TEMPLATE_DIR}/${f}.tmpl" ]; then
        case "$f" in
          extensions.conf)
            envsubst '${AUDIOSOCKET_HOST}${AUDIOSOCKET_PORT}' < "${TEMPLATE_DIR}/${f}.tmpl" > "${TARGET_DIR}/${f}"
            ;;
          rtp.conf)
            envsubst '${RTP_START}${RTP_END}' < "${TEMPLATE_DIR}/${f}.tmpl" > "${TARGET_DIR}/${f}"
            ;;
          *)
            envsubst < "${TEMPLATE_DIR}/${f}.tmpl" > "${TARGET_DIR}/${f}"
            ;;
        esac
        echo "[entrypoint] Rendered ${TARGET_DIR}/${f}"
    fi
done

mkdir -p /var/log/asterisk/cdr-csv /etc/asterisk/managed
[ -f /etc/asterisk/managed/clinics.conf ] || touch /etc/asterisk/managed/clinics.conf
chmod 700 /etc/asterisk/managed
chmod 600 /etc/asterisk/managed/clinics.conf
# Legacy trunk is retained until the backend imports its verified clinic owner.
# A durable marker prevents a duplicate registration after container recreation.
# A non-empty managed file means at least one clinic endpoint was successfully
# generated. It is then safe to prevent the legacy global registration from
# returning after a container restart.
if [ -s /etc/asterisk/managed/clinics.conf ] || [ -z "$NETGSM_SIP_USER" ] || [ -z "$NETGSM_SIP_PASSWORD" ]; then
    sed -i '/^\[netgsm-auth\]/,/^\[netgsm-identify\]/{ /^\[netgsm-identify\]/!d; }' /etc/asterisk/pjsip.conf
    sed -i 's/endpoint=netgsm-endpoint/endpoint=netgsm-ingress/' /etc/asterisk/pjsip.conf
fi

exec "$@"
