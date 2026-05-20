FROM andrius/asterisk:22

USER root

RUN set -eux; \
    if command -v apk >/dev/null 2>&1; then \
        apk add --no-cache gettext bash ca-certificates; \
    elif command -v apt-get >/dev/null 2>&1; then \
        apt-get update && apt-get install -y --no-install-recommends gettext-base bash ca-certificates && rm -rf /var/lib/apt/lists/*; \
    fi

COPY templates/ /etc/asterisk-templates/
COPY etc/ /etc/asterisk/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5060/tcp
EXPOSE 5060/udp
EXPOSE 10000-10200/udp

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["asterisk", "-fvvv", "-T"]
