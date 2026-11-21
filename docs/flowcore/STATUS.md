# FlowCore — Kısa Durum (önce bunu oku)

Ayrıntılı kayıtlar: `progress.md` (uzun, gerekmedikçe okuma), `plan.md`, `execution-audit.md`.

## Durum
- Planın tüm kartları (T-0.0 – T-11.5) tamam. Faz 8–11 "yerel" kabul edildi; gerçek sağlayıcı (Gemini/OpenAI/Telegram/Asterisk/LiveKit) denemesi yapılmadı.
- Kalite kapısı: `bun run check` (`--fast` testleri atlar). Faz kapıları: `bun run verify:phaseN`.
- Depo: github.com/berat639/flowcore (özel, `main`).

## Yayın
- Sunucu `/opt/flowcore`, `docker compose -f docker-compose.dokploy.yml -f docker-compose.traefik.yml up -d --build [--no-deps hizmet]`.
- Adres: https://asistan.thinpine.com (Studio `/`, API `/api`). Dokploy panelinde kayıtlı değil.
- Gizli anahtarlar yalnız sunucudaki `.env` içinde (`GEMINI_API_KEY` dahil).

## Açık işler
- Kayıt (`/kayit-ol`) herkese açık; gerekirse kapatma ayarı eklenecek.
- İşlemler/Koşullar için kaydetme ucu yok; simülatör `collected`/`currentStep` boş.
- Ses oturumunda araç yürütücü ve kiracı/ajan çözümü bağlı değil.
- Gerçek servislerle canlı deneme yapılmadı.

## RTK (token süzme kancası)
- Kurulu (`brew install rtk`, v1.2.0), kanca `.claude/settings.local.json` içinde (yerel, depoda yok). Elle denemede %25,9 tasarruf; kancanın otomatik çalışması henüz bir Flowcore oturumunda DOĞRULANMADI. Kural: AGENTS.md "RTK kancası doğrulaması".
- Copilot: `rtk init --copilot` ile proje kancası eklendi (`.github/hooks/`); henüz bir Copilot oturumunda DOĞRULANMADI. Copilot'un okuma kısıtı ve alt ajan modeli ayarı yok (Claude Code'a özgü).
- Model seçimi: AGENTS.md "Model Seçim Kuralı" (haiku/sonnet/opus, görev zorluğuna göre ajan kendisi seçer).
