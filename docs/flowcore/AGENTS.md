# FlowCore — Ajan Kuralları

Bu dosya FlowCore projesi içindir (hedef repo: `/Users/beratincecam/Desktop/flowcore`). voiceai projesinin kök `AGENTS.md` dosyasından bağımsızdır; voiceai kodunu değiştirmek için kullanılmaz. Üst dizindeki voiceai `AGENTS.md` ile çelişen her konuda BU dosya geçerlidir (örn. medikal renk kimliği yerine nötr palet).

## Önce Oku
1. `plan.md` — tam plan ve görev kartları (tek doğruluk kaynağı).
2. `progress.md` — hangi kartın durumu ne.
3. `decisions.md` — alınmış kararlar ve açık sorular.
4. `glossary.md` — kod terimleri ve arayüz metin eşlemeleri.

## Çalışma Kuralları
- Plan durumu **ONAY BEKLİYOR** ise yalnız belge kartı (T-0.0) yapılabilir; kod kartlarına geçilmez. Onay yalnız kullanıcının `plan.md` başındaki `Durum:` satırını `ONAYLANDI` yapmasıyla verilir; ajan bu satırı değiştiremez.
- Kart seçimi: `plan.md` sırasına göre `DONE` olmayan ve bağımlılıkları `DONE` olan ilk kart. Kart bitince dur, özet ver; sonraki karta kendiliğinden geçme.
- Kartlar `T-<faz>.<no>` sırasıyla ve `Bağımlılık` alanına uyularak yapılır.
- Kart bitti = tüm Kabul Kriterleri sağlandı + Doğrulama Komutu exit 0.
- Belirsizlikte tahmin etme: `decisions.md`'ye soru yaz, kartı `BLOCKED` işaretle.
- Her kart sonunda `progress.md`'ye satır ekle: Kart | Durum | Değişen dosyalar | Doğrulama | Tarih | Ajan/IDE.
- Durumlar: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `NEEDS_NETWORK`, `WAITING_APPROVAL`.
- Ağ yoksa (`bun install` çalışmıyorsa) kartı `NEEDS_NETWORK` işaretle, kod yazmaya devam et.

## Yazma İzinleri
- `/Users/beratincecam/Desktop/voiceai` SALT OKUNUR. Tek istisna: `/Users/beratincecam/Desktop/voiceai/docs/flowcore/**`.
- Kod yalnız `/Users/beratincecam/Desktop/flowcore` içine yazılır.

## Teknoloji (değiştirmek için decisions.md'ye gerekçe)
- TypeScript strict, Bun ≥ 1.2, Bun workspaces + Turborepo, Biome, `bun test`.
- Hono + `@hono/zod-openapi`; Postgres 17 + pgvector + pg_trgm; Drizzle.
- DBOS Transact (durable iş); Redis yalnız hot state. BullMQ ve Mastra KULLANILMAZ. DBOS Bun'da çalışmazsa yalnız `apps/worker` Node.js 22+ ile çalışır.
- Vercel AI SDK Core; `@modelcontextprotocol/sdk`.
- Ses: Gemini Live / OpenAI Realtime + kademeli STT→LLM→TTS; Asterisk AudioSocket; WhatsApp Calling (SIP); Web: LiveKit birincil + WebSocket yedek.
- Studio: Next.js App Router + `@xyflow/react` + elkjs.

## Kod Kuralları
- Kod tanımlayıcıları İngilizce. Sektör/klinik terimi yasak (`patient`, `hasta`, `doktor`, `hekim`, `clinic`, `klinik`, `dental`, `tedavi`, `odontogram`).
- Zorunlu env yok: `process.env.X ?? 'default'`; `!` non-null assertion yasak; yeni env `.env.example`'a yorumla eklenir.
- İstisna: şifreleme anahtarı için koda gömülü varsayılan YASAK. Anahtar yoksa uygulama açılır ama bağlantı bilgisi kaydetme kapalı kalır ve arayüzde sade uyarı gösterilir.
- Kiracı izolasyonu: her tenant tablosunda `tenant_id` + Postgres RLS; parola Argon2id; httpOnly oturum çerezi.
- Migration idempotent (`IF NOT EXISTS`); iki kez çalışınca exit 0; açılışta `ensure*()` self-healing.
- Kod üretiminde (codegen) yalnız izinli AST düğümleri; literal'ler `JSON.stringify`; path whitelist `^[a-zA-Z0-9_.]+$`; SQL yalnız parametreli.
- `http.request` işleminde SSRF koruması: özel IP / metadata adresleri reddedilir.
- Gizli bilgiler (token, şifre) loglanmaz ve yanıtlara yazılmaz.

## Arayüz Kuralları
- Arayüzde teknik terim yok (liste: `glossary.md`). Tüm metinler `packages/ui/src/glossary.ts` üzerinden.
- Değişken = etiket çipi; koşul = Türkçe cümle; sembolik operatör ve AND/OR yok.
- Hata = sade Türkçe + çözüm önerisi. 2 satırı aşan açıklama ⓘ InfoTooltip içinde.
- Opak tasarım, blur/glassmorphism yok; açık + koyu tema CSS değişkenleri; Clay/Neo gölge tokenları; modal overlay `var(--modal-overlay)`.

## Komutlar (T-0.2 sonrası geçerli)
- `bun run typecheck` · `bun run lint` · `bun test`
- `bun run db:migrate` (iki kez çalıştırılarak idempotentlik doğrulanır)
- `bun run lint:domain-terms` · `bun run lint:ui-terms`
