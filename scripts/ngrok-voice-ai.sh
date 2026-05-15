#!/usr/bin/env bash
# voice-ai — ngrok başlat, URL'leri otomatik env'e yaz, server+client restart et
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/ngrok.yml"
ENV_FILE="$ROOT/.env"
ENV_LOCAL="$ROOT/client/.env.local"

# ── ngrok authtoken config ───────────────────────────────────────────────────
prefix=()
for f in \
  "${HOME}/.config/ngrok/ngrok.yml" \
  "${HOME}/Library/Application Support/ngrok/ngrok.yml" \
  "${HOME}/.ngrok2/ngrok.yml"
do
  if [[ -f "$f" ]]; then
    prefix+=(--config "$f")
    break
  fi
done

# ── Çalışan ngrok + server + client'ı durdur ────────────────────────────────
echo "⏹  Eski süreçler durduruluyor..."
pkill -f ngrok        2>/dev/null || true
pkill -f "src/index.ts" 2>/dev/null || true
pkill -f "next dev"   2>/dev/null || true
sleep 1

# ── Ngrok'u arka planda başlat ───────────────────────────────────────────────
echo "🚇 Ngrok başlatılıyor..."
ngrok "${prefix[@]}" --config "$CFG" start voice-client voice-server &
NGROK_PID=$!

# ── Tüneller hazır olana kadar bekle ────────────────────────────────────────
echo "⏳ Tünel URL'leri bekleniyor..."
for i in $(seq 1 20); do
  sleep 1
  TUNNELS=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)
  COUNT=$(echo "$TUNNELS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tunnels',[])))" 2>/dev/null || echo 0)
  if [[ "$COUNT" -ge 2 ]]; then
    break
  fi
  if [[ "$i" -eq 20 ]]; then
    echo "❌ Tüneller 20 saniyede açılmadı. Ngrok çalışıyor mu?"
    exit 1
  fi
done

# ── URL'leri parse et ────────────────────────────────────────────────────────
read -r SERVER_URL CLIENT_URL < <(python3 - <<'PYEOF'
import json, urllib.request
d = json.loads(urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels").read())
urls = {}
for t in d["tunnels"]:
    addr = t["config"]["addr"]
    url  = t["public_url"]
    if "3001" in addr:
        urls["server"] = url
    elif "3000" in addr:
        urls["client"] = url
print(urls.get("server",""), urls.get("client",""))
PYEOF
)

if [[ -z "$SERVER_URL" || -z "$CLIENT_URL" ]]; then
  echo "❌ Port eşleştirme başarısız. Ngrok tünel adlarını kontrol et."
  exit 1
fi

# Statik domain — APP_URL / OAUTH_REDIRECT_URI bu domain'i kullanır, değişmez
STATIC_SERVER="https://pathwayed-unwanderingly-romana.ngrok-free.dev"

echo "✅ voice-server → $STATIC_SERVER (statik domain)"
echo "✅ voice-client → $CLIENT_URL"

# ── client/.env.local güncelle ───────────────────────────────────────────────
ADMIN_PASS=$(grep -E "^ADMIN_PASSWORD=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 || echo "servis2024")

cat > "$ENV_LOCAL" <<EOF
NEXT_PUBLIC_WS_URL=${SERVER_URL}/ws?ngrok-skip-browser-warning=true
NEXT_PUBLIC_BACKEND_URL=${SERVER_URL}
ADMIN_PASSWORD=${ADMIN_PASS}
EOF
echo "📝 client/.env.local güncellendi"

# ── .env güncelle (CLIENT_APP_URL, CORS_ORIGIN) ─────────────────────────────
# APP_URL / OAUTH_REDIRECT_URI statik domain kullandığı için değiştirilmez
python3 - "$ENV_FILE" "$STATIC_SERVER" "$CLIENT_URL" <<'PYEOF'
import sys, re

path, server, client = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    content = f.read()

replacements = {
    r"^CLIENT_APP_URL=.*": f"CLIENT_APP_URL={client}",
    r"^CORS_ORIGIN=.*":    f"CORS_ORIGIN={client},{server}",
}

for pattern, repl in replacements.items():
    content = re.sub(pattern, repl, content, flags=re.MULTILINE)

with open(path, "w") as f:
    f.write(content)
PYEOF
echo "📝 .env güncellendi (CLIENT_APP_URL + CORS_ORIGIN)"

# ── Server + Client restart ──────────────────────────────────────────────────
echo "🚀 Server başlatılıyor..."
cd "$ROOT/server" && bun --watch --env-file "../.env" src/index.ts &
sleep 2

echo "🚀 Client başlatılıyor..."
cd "$ROOT/client" && bun run dev &
sleep 3

# ── Özet ────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo "  🟢 Her şey hazır!"
echo ""
echo "  📱 Mobil / Frontend:"
echo "     $CLIENT_URL"
echo ""
  echo "  🔧 Backend API:"
  echo "     $STATIC_SERVER"
echo "══════════════════════════════════════════════"
echo ""

# Ana script burada biter; arka plan süreçleri çalışmaya devam eder
wait $NGROK_PID
