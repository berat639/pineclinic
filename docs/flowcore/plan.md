# PLAN: FlowCore — Sektörden Bağımsız AI-Driven Akış & Ajan Platformu

- Sürüm: 2 (model-bağımsız; Claude/Opus, Gemini CLI, OpenAI Codex, Copilot tarafından yürütülebilir)
- Durum: **ONAYLANDI** — Kullanıcı onayı alındı (2026-11-06).
- Tarih: 2026-11-06

## 0. Ajanlar İçin Okuma Kuralları (HER AJAN ÖNCE BUNU OKUR)

- Bu belge kendi başına yeterlidir; önceki sohbet bağlamı gerekmez.
- Görevler `T-<faz>.<no>` ID'li kartlardır. Sırayla, `Bağımlılık` alanı tamamlanmadan başlanmaz.
- Her kart: Amaç / Girdi (kaynak dosyalar, mutlak yol) / Çıktı (oluşturulacak dosyalar) / Adımlar / Kabul Kriterleri / Doğrulama Komutu.
- Kart bitti sayılması için Kabul Kriterlerinin TAMAMI ve Doğrulama Komutu exit 0 olmalı.
- Belirsizlikte tahmin etme: kartın "Kapsam Dışı" alanına bak; yoksa `decisions.md` içine soru olarak yaz ve kartı `BLOCKED` işaretle.
- Kaynak repo SALT OKUNUR: `/Users/beratincecam/Desktop/voiceai` — ona asla yazma. TEK İSTİSNA: `/Users/beratincecam/Desktop/voiceai/docs/flowcore/**` (plan ve ilerleme belgelerinin paralel kopyası; bkz. T-0.0).
- Hedef repo: `/Users/beratincecam/Desktop/flowcore`
- Belge yolları: flowcore reposu oluşana kadar `docs/...` ifadeleri `voiceai/docs/flowcore/...` anlamına gelir; T-0.1 sonrası `flowcore/docs/...` anlamına gelir.
- Kod tanımlayıcıları İngilizce; arayüz metinleri sade Türkçe (Bkz. Bölüm 4).
- Ağ erişimi olmayan sandbox'larda (Codex): bağımlılık kurulumu gereken kartlarda `bun install` çalışmazsa kartı `NEEDS_NETWORK` işaretle, kod yazmaya devam et.
- Her kart sonunda `progress.md` dosyasına: kart ID, durum, değişen dosyalar, doğrulama sonucu, tarih, ajan/IDE ekle.
- Durum değerleri: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `NEEDS_NETWORK`, `WAITING_APPROVAL`.
- Onay mekanizması: Kullanıcı onayı yalnız bu belgenin başındaki `Durum:` satırının `ONAYLANDI` yapılmasıyla (ve `decisions.md` Q-1'in kapatılmasıyla) verilir. Ajan bu satırı kendisi DEĞİŞTİREMEZ.
- Bir kart bitince ajan durur ve özet verir; bir sonraki karta kendiliğinden geçmez (kullanıcı aksini söylemedikçe).
- Kart seçimi: `plan.md` kart sırasına göre, `progress.md`'de `DONE` olmayan ve bağımlılıkları `DONE` olan ilk kart.

## 1. Ajan Bağlam Dosyaları

T-0.0'da `voiceai/docs/flowcore/` altında oluşturulur; T-0.1'de flowcore köküne/`docs/` altına kopyalanır.

- `AGENTS.md` (tek doğruluk kaynağı; Codex ve Copilot okur): Bölüm 0, 2, 3, 4, 5 özetleri + komutlar.
- `GEMINI.md`: `@./AGENTS.md` import (Gemini CLI import sözdizimi). Alternatif: `.gemini/settings.json` → `{"context":{"fileName":["AGENTS.md"]}}`.
- `CLAUDE.md`: `@AGENTS.md` import.
- `plan.md` (bu belge), `progress.md`, `decisions.md`, `glossary.md`, `prompts/start.md`.
- Çakışma uyarısı: voiceai kökündeki `AGENTS.md` klinik projesine aittir. Codex alt klasördeki `AGENTS.md`'yi üsttekilerle birleştirir (alttaki öncelikli); VS Code Copilot iç içe `AGENTS.md`'yi yalnız `chat.useNestedAgentsMdFiles` ayarı açıkken okur. Bu yüzden FlowCore işleri için IDE'de klasör olarak `voiceai/docs/flowcore` (T-0.1 sonrası `~/Desktop/flowcore`) açılmalıdır. FlowCore `AGENTS.md` kuralları voiceai kök `AGENTS.md` ile çelişirse FlowCore kuralları geçerlidir.

## 2. Terimler Sözlüğü (kodda kullanılacak sabit adlar)

| Terim | Anlam |
|---|---|
| Tenant | Müşteri organizasyonu (eski `clinicId` yerine `tenantId`) |
| Workspace | Tenant altında proje/marka (`workspaceId`) |
| Agent | Persona + model + ses + KB kapsamı + kanallar + ana akış |
| Contact | Konuşulan kişi (eski patient/müşteri) |
| EntityType / FieldDefinition / Record | Dinamik kayıt türü / bilgi alanı / kayıt (JSONB `data`) |
| Expression (Expr AST) | Koşul/hesap ifadesinin JSON ağacı |
| IR | Doğrulanmış, normalize, hash'li ara gösterim |
| Artifact | Derleyici çıktısı (hedef + içerik + hash), değiştirilemez |
| FlowVersion | Yayınlanmış, derlenmiş akış sürümü |
| ActionDefinition | `defineAction` ile kayıtlı işlem |
| ChannelAdapter | Kanal arayüzü (verify / parseInbound / send / capabilities) |
| RealtimeModelAdapter | Gerçek zamanlı ses modeli arayüzü |
| WebVoiceTransport | Web ses bağlantı arayüzü (livekit / websocket) |

## 3. Teknoloji Kararları (değiştirmek için `decisions.md`'ye gerekçe yaz)

- Dil: TypeScript (strict), runtime Bun ≥ 1.2; monorepo Bun workspaces + Turborepo; lint/format Biome; test `bun test` (studio için gerekirse Vitest).
- HTTP: Hono + `@hono/zod-openapi`. DB: Postgres 17 + pgvector + pg_trgm; ORM Drizzle.
- Durable iş: DBOS Transact (TS). Redis: yalnız hot session / pubsub / rate limit. BullMQ KULLANILMAZ.
- LLM: Vercel AI SDK Core (sağlayıcı bağımsız). MCP: `@modelcontextprotocol/sdk` (client + server). Mastra KULLANILMAZ.
- Realtime ses: Gemini Live, OpenAI Realtime adapter + kademeli (STT → LLM → TTS) mod. Transport: Asterisk AudioSocket, WhatsApp Calling (SIP → Asterisk), Web (LiveKit birincil + WebSocket otomatik yedek).
- Studio: Next.js App Router + `@xyflow/react` + elkjs.
- Kanallar: Telefon, WhatsApp (Meta Cloud direkt, n8n, Evolution), WhatsApp Calling, Telegram, Web chat/voice; sonra Instagram/Messenger, SMS, e-posta.
- Ortam: hiçbir yeni özellik zorunlu env istemez; `process.env.X ?? 'default'`; `!` assertion yasak; `.env.example` yorumlu.
- Migration: idempotent (`IF NOT EXISTS`), 2 kez çalıştırılınca exit 0; açılışta `ensure*()` self-healing.
- Gizli anahtar istisnası: Şifreleme anahtarı (`ENCRYPTION_KEY`) için koda gömülü varsayılan değer YASAKTIR. Env yoksa uygulama yine açılır, ancak kanal bağlantı bilgisi kaydetme kapalı olur ve arayüzde sade uyarı gösterilir ("Bağlantı bilgilerini kaydetmek için güvenlik anahtarı tanımlanmalı").
- Kimlik doğrulama ve kiracı izolasyonu: parola Argon2id (`Bun.password`), httpOnly + SameSite oturum çerezi, RBAC; tüm tenant tablolarında `tenant_id` + Postgres Row Level Security (`app.tenant_id` oturum değişkeni).
- Runtime riski: DBOS Transact TS Node.js hedefler; Bun uyumu T-4.4'te doğrulanır. Uyumsuzsa yalnız `apps/worker` Node.js 22+ ile çalışır (diğer uygulamalar Bun'da kalır).

## 4. Arayüz Dili Kuralı (tüm UI kartları için zorunlu)

- Yasaklı terimler UI'da görünmez: codegen, IR, AST, JSON, şema/schema, Zod, DDL, SDK, MCP, webhook, regex, token, embedding, chunk, vektör, node, edge, payload, API key, HMAC, SIP, cron, idempotent, değişken adları (snake_case/camelCase), `{{...}}`, `==`, `!=`, `>`, AND/OR.
- Tüm metinler `packages/ui/src/glossary.ts` üzerinden; bileşenlerde doğrudan string yazmak yasak.
- Eşleme tablosu: `glossary.md`.
- Değişken = etiket çipi (`[Müşteri adı]`); koşul = cümle ("Şehir İstanbul ise ve yaş en az 18 ise").
- Hata = sade Türkçe + çözüm önerisi; ham hata yalnız "Ayrıntılar" altında destek kodu olarak.
- 2 satırı aşan açıklama → başlık yanında ⓘ InfoTooltip.
- Ham kod / teknik görünüm yalnız "Geliştirici modu" rolünde.
- Görsel: opak, glassmorphism/blur yok, açık + koyu tema CSS değişkenleri, Clay/Neo gölge tokenları, medikal renk kimliği yerine nötr marka paleti; modal overlay `var(--modal-overlay)` yarı saydam.
- Token kaynağı (T-10.1'de kopyalanır): `voiceai/client/app/globals.css` içindeki `--pc-*` açık/koyu değerleri (`--pc-neo-card`, `--pc-neo-subcard`, `--pc-neo-inset`, `--pc-clay-btn`, `--pc-clay-pale`, `--pc-clay-primary`, `--pc-clay-total`, `--pc-modal-shadow`), `voiceai/client/styles/clinic-depth.module.css` → `packages/ui/src/depth.module.css`, `voiceai/client/app/admin/components/ui/InfoTooltip.tsx` → `packages/ui/src/InfoTooltip.tsx`. Element → token eşlemesi: ana kart `--pc-neo-card`; iç kutu `--pc-neo-subcard`; input/select/sekme kanalı `--pc-neo-inset`; ikincil buton `--pc-clay-btn`; rozet `--pc-clay-pale`; birincil buton `--pc-clay-primary` (yazı her zaman beyaz); özet kutusu `--pc-clay-total`; modal/drawer/tooltip/menü `--pc-modal-shadow` (beyaz hale yok). Koyu modda beyaz dış gölge (`-3px -3px 8px #ffffff`) kullanılmaz.
- Doğrulama: `bun run lint:ui-terms` → glossary + tsx string literal taraması, 0 bulgu.

## 5. Kaynak → Hedef Eşleme

voiceai mutlak kök: `/Users/beratincecam/Desktop/voiceai`

| Kaynak | Hedef | Atılacak domain parçaları |
|---|---|---|
| `server/src/rag.ts` | `packages/knowledge/src/{chunk,embed,cache}.ts` | — |
| `server/src/db/repositories/knowledge.ts` | `packages/knowledge/src/repository.ts` | `findCustomerDocByPhone`, `musteri` kategori filtresi, `clinicId` → `tenantId` |
| `server/src/services/knowledge.ts` | `packages/knowledge/src/search.ts` | `DOCTOR_OR_CLINIC_QUERY_RE`, `buildClinicRosterAndHoursText` → genel "context source" |
| `server/src/services/knowledge-extract.ts` | `packages/knowledge/src/extract.ts` | — |
| `server/src/api/knowledge.ts` | `apps/api/src/routes/knowledge.ts` | `/api/admin/categories` klinik seed'leri |
| `server/src/integrations/whatsapp.ts` | `packages/channels/src/whatsapp/{evolution,n8n-meta,meta-cloud,verify,parse}.ts` | `clinics.*` kolonları → `channel_connections` |
| `server/src/services/whatsapp-conversation.ts`, `whatsapp-live.ts`, `whatsapp-tools.ts` | `packages/runtime/src/conversation-worker.ts` | `randevuOlustur`, `musteriSorgula`, `hastaNotKaydet`, `gecmisRandevular`, `patients`, `treatmentPlans` |
| `server/src/queue/whatsapp-queue.ts` | DBOS queue (`apps/worker`) | BullMQ |
| `server/src/services/flow-engine.ts` | `packages/runtime/src/engine.ts` | `kayitli`, `caller.isKnownPatient` |
| `server/src/db/repositories/flows.ts` (evaluate*, flowToToolFields, flowToPromptText) | `packages/ir/src/expr` + `packages/compiler` | `clinic.isOpen` → `business.isOpen` |
| `server/src/services/flow-validation.ts` | `packages/compiler/src/validate.ts` | `EXECUTABLE_ACTIONS` klinik listesi |
| `server/src/services/assistant-tool-declarations.ts` | `packages/compiler/src/targets/tools.ts` | tüm Türkçe klinik araç adları |
| `server/src/services/asterisk-ami.ts`; `server/src/index.ts` AudioSocket bölümü; `infra/asterisk/**` | `apps/voice-gateway/src/**`, `infra/asterisk/**` | klinik prompt'ları |
| `deploy/n8n/*.json`, `docker-compose.n8n.yml` | `deploy/n8n/**` | "VoiceAI", clinic adları |
| `client/app/admin/components/FlowBuilder.tsx`, `KnowledgeTab.tsx`, `knowledge/*`, WhatsApp kartları, `client/lib/flow-path-summary.ts`, `client/lib/ui-glossary.ts` | `apps/studio/**` (referans; yeniden yazım) | tüm klinik sekmeleri |
| `client/app/globals.css` (`--pc-*`), `client/styles/clinic-depth.module.css`, `client/app/admin/components/ui/InfoTooltip.tsx` | `packages/ui/src/{theme.css,depth.module.css,InfoTooltip.tsx}` | `clinic` adları |
| `server/src/db/repositories/flows.test.ts` | `packages/ir/test/expr-compat.test.ts` (operatör davranış referansı) | klinik alan adları |
| `server/src/services/integration-secrets.ts` | `packages/core/src/secrets.ts` | — |

Port kuralı: önce kopyala → domain parçalarını sil → `tenantId` uyarla → test yaz → derle.

## 6. Görev Kartları

### Faz 0 — İskelet

**T-0.0 Plan belgelerini voiceai'ye paralel taşı** | Bağımlılık: yok (İLK GÖREV)
- Çıktı klasörü: `/Users/beratincecam/Desktop/voiceai/docs/flowcore/`
  - `README.md`: klasörün amacı + hangi IDE/ajan hangi dosyayı okur tablosu.
  - `plan.md`: bu belge.
  - `AGENTS.md`: FlowCore ajan kuralları. voiceai kök `AGENTS.md` DEĞİŞTİRİLMEZ.
  - `GEMINI.md`: `@./AGENTS.md` ve `@./plan.md`.
  - `CLAUDE.md`: `@AGENTS.md` ve `@plan.md`.
  - `progress.md`, `decisions.md`, `glossary.md`.
  - `prompts/start.md`: herhangi bir IDE'ye yapıştırılacak başlangıç komutu.
- Senkron kuralı: flowcore repo oluşunca (T-0.1) bu belgeler oraya kopyalanır; tek doğruluk kaynağı ondan sonra `flowcore/docs` olur. `voiceai/docs/flowcore/README.md`'ye "güncel kopya flowcore reposundadır" notu eklenir; `progress.md` her kart sonunda iki yerde güncellenir.
- Kabul: dosyalar mevcut; voiceai kök `AGENTS.md`, `client/`, `server/` değişmemiş (`git status` yalnız `docs/flowcore/` gösterir).
- **DUR:** T-0.0 bitince kullanıcı onayı beklenir; onay gelmeden T-0.1'e GEÇİLMEZ.

**T-0.1 Repo iskeleti** | Bağımlılık: T-0.0 + kullanıcı onayı
- Çıktı: `package.json` (workspaces), `turbo.json`, `biome.json`, `tsconfig.base.json`, `apps/{api,studio,voice-gateway,worker}`, `packages/{core,ir,compiler,runtime,actions,knowledge,channels,voice,ai,db,ui,sdk-generated}`, `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `docs/{plan,progress,decisions,glossary}.md`, `docs/prompts/start.md`, `.env.example`, `docker-compose.yml` (postgres `pgvector/pgvector:pg17`, redis, `asterisk` ve `voice` (LiveKit) profilleri).
- Kabul: `bun install && bun run typecheck && bun run lint` exit 0; boş testler geçer.

**T-0.2 CI scriptleri** | Bağımlılık: T-0.1
- Çıktı: root scriptleri `typecheck`, `lint`, `test`, `db:migrate`, `lint:ui-terms`, `lint:domain-terms`.
- `lint:domain-terms`: `patient|hasta|doktor|hekim|clinic|klinik|dental|tedavi|odontogram` regex'i (büyük/küçük harf duyarsız) `apps/**` ve `packages/**` kaynağında 0 bulgu. Hariç: `docs/**`, `**/fixtures/**`, `**/*.md`, `scripts/lint-domain-terms.ts`.
- Kabul: üç lint komutu boş iskelette exit 0.

### Faz 1 — Çekirdek Model | Bağımlılık: Faz 0

- **T-1.1** DB şeması (`packages/db`): tenants, workspaces, users, memberships(role), agents, channel_connections (credentials AES-256-GCM), contacts, contact_identities (type, value; tenant başına unique), contact_consents (channel, status), conversations, messages (direction, status, delivery_status, provider_message_id, sequence).
- **T-1.2** Dinamik varlık: entity_types, field_definitions (key, label, type[text, number, bool, date, time, datetime, enum, phone, email, money, json-list, reference], required, indexed, semantic, pii, computed_expr, validation), records (id, tenant_id, entity_type_id, data jsonb, version, created_at, updated_at) + GIN(data).
- **T-1.3** Migration + ensure: `packages/db/src/migrate.ts`, `ensureCoreSchema()`.
- **T-1.4** Kimlik doğrulama + kiracı izolasyonu: kayıt/giriş/çıkış, Argon2id, oturum çerezi, rol tabanlı yetki middleware'i, RLS politikaları, istek başına `SET LOCAL app.tenant_id`.
- **T-1.5** API çekirdeği (`apps/api`): Hono uygulaması, hata biçimi (sade Türkçe mesaj + destek kodu), OpenAPI belgesi, sağlık kontrolü `/health`, temel CRUD: tenants, workspaces, agents, contacts, entity_types, field_definitions, records. Sonraki her faz kendi route'larını `apps/api/src/routes/` altına ekler.
- **T-1.6** Kanal, konuşma ve üyelik API'si | Bağımlılık: T-1.4, T-1.5 (ekleme kartı; Faz 1 kabulü bu kart bitene kadar tam sayılmaz)
  - `channel_connections` CRUD: kimlik bilgileri yalnız yazılır; okumada asla geri dönmez (maskeli "kayıtlı" göstergesi); `ENCRYPTION_KEY` yoksa kaydetme kapalı ve sade Türkçe uyarı (D-12); bağlantı durumu alanı (bağlı / hata / bekliyor).
  - `conversations` ve `messages` salt okunur uçları: sayfalama (imleç), kanal / durum / kişi / tarih süzgeci, mesaj sıralaması `sequence`'e göre; yazma uçları Faz 7 çalışanına aittir.
  - Üyelik ve davet: `memberships` listeleme, rol değiştirme, davet oluşturma (tek kullanımlık, süreli, hash'li belirteç), daveti kabul, üyelik kaldırma; son sahip kaldırılamaz; yalnız `owner`/`admin` yönetir.
  - Tüm uçlar `apps/api/src/routes/` altında, OpenAPI'de görünür, RLS ve rol denetimiyle korunur.
  - Kabul: kiracı A kullanıcısı B'nin bağlantı/konuşma/üyeliklerini okuyamaz ve yazamaz; kimlik bilgisi hiçbir yanıtta görünmez; davet tekrar kullanılamaz ve süresi dolunca reddedilir; son sahip silinemez; migrate 2 kez exit 0.
  - Tekrarlanabilir doğrulama: `bun run verify:t1.6`; gerçek PostgreSQL/HTTP, mikrosaniyeli imleç ve eşzamanlı son sahip koruması. Uygulama sözleşmesi: `docs/tenant-management.md`.
- Kabul: migrate 2 kez exit 0; drizzle typecheck; seed: 1 tenant, 1 workspace, 1 agent, örnek EntityType "Talep"; tenant A kullanıcısı tenant B kaydını okuyamaz testi (RLS).

### Faz 2 — Expression Dili | Bağımlılık: T-1.2

- **T-2.1** Expr AST tipleri + Zod doğrulayıcı (`packages/ir/src/expr/ast.ts`). Düğümler: literal, ref(path), compare(eq, neq, gt, gte, lt, lte, between, in), text(contains, startsWith, endsWith, matches-safe), logic(and, or, not), exists, isEmpty, list(any, all, len), call(fn: now, lower, upper, len, daysBetween, addDays, round), intent(label), semanticMatch(text, threshold).
- **T-2.2** Referans yorumlayıcı `evaluate(ast, ctx)` (doğruluk kaynağı; derleyici buna karşı fuzz test edilir).
- **T-2.3** Türkçe metin ayrıştırıcı `parseTr(text) → AST` ve `describeTr(AST) → cümle` ("ve", "veya", "değilse", "en az", "içerir", "boş ise").
- **T-2.4** Sistem değişkenleri: contact.isKnown, contact.tags, contact.attributes.*, channel.type, call.durationSec, call.silenceCount, time.hour, time.weekday, business.isOpen (tenant saat dilimi).
- Kabul: voiceai `server/src/db/repositories/flows.test.ts` operatör test vakalarının eşdeğerleri geçer; parse → describe → parse round-trip testleri.

### Faz 3 — Derleyici / Codegen | Bağımlılık: Faz 2

- **T-3.1** IR normalize + hash (`packages/compiler/src/ir.ts`): EntityType, Field, Action, Flow → IR; sha256 içerik hash.
- **T-3.2** Hedef expr → JS (`targets/js.ts`). Kural: yalnız izinli AST düğümleri; literal'ler `JSON.stringify`; ref'ler `ctx.get("<path>")` ile, path whitelist regex `^[a-zA-Z0-9_.]+$`; `new Function("ctx", "h", body)`; LRU(hash) önbellek.
- **T-3.3** Hedef expr → SQL WHERE (`targets/sql.ts`), yalnız parametreli (`$1..`), JSONB yolları `data->>'key'` + cast.
- **T-3.4** Hedef Field → Zod + JSON Schema (`targets/schema.ts`).
- **T-3.5** Hedef LLM araç tanımı (`targets/tools.ts`): gemini, openai, anthropic, mcp formatları.
- **T-3.6** Hedef Flow → durum makinesi modülü (`targets/state-machine.ts`): states, transitions (guard fn), actions; erişilemeyen adım, sonsuz döngü, bağlantısız çıkış analizi.
- **T-3.7** Hedef prompt parçaları (`targets/prompt.ts`): adım bazlı, token bütçeli.
- **T-3.8** Hedef DDL (`targets/ddl.ts`): indexed alan → generated column + index; "materialize" → fiziksel tablo; çıktı dry-run diff + uygulama.
- **T-3.9** Hedef TS tipleri + typed SDK + OpenAPI (`targets/sdk.ts`) → `packages/sdk-generated/<tenant>/`; CLI `bun run flowcore codegen pull --tenant <id>`.
- **T-3.10** artifacts tablosu + flow_versions (immutable) + yayın hattı: taslak → derle → doğrula → simülasyon → yayınla; çalışan oturum eski sürümde biter; geri alma.
- Kabul: golden snapshot testleri; fuzz 10k rastgele AST'de `evaluate` == derlenmiş fn; enjeksiyon testleri (literal `"); process.exit(1); ("`, path `a;b`) kod üretmez / hata verir; 1M değerlendirme benchmark raporu `progress.md`'ye.

### Faz 4 — Runtime | Bağımlılık: T-3.6, T-3.10

- **T-4.1** `packages/runtime/src/engine.ts`: derlenmiş makine yükle, `accept(event) → {revision, fields, next, completed}`, idempotent event id, completedActions (voiceai `flow-engine.ts` davranışı referans).
- **T-4.2** Durum: Redis hızlı yol + Postgres checkpoint (`flow_sessions`).
- **T-4.3** Adım tipleri: Start, Message, CollectField (yeniden sorma), Condition (switch, çok çıkış), Action, End, IntentRouter, AiAgent, AgentHandoff, Subflow, Goto, Wait/Timer, WaitForEvent, Loop, Parallel, HumanApproval.
- **T-4.4** DBOS entegrasyonu (`apps/worker`): Wait/Timer/WaitForEvent/HumanApproval/uzun Action'lar workflow olarak; ses turu senkron kalır.
- Kabul: `kill -9` sonrası workflow devam testi; aynı event 2 kez → tek etki.

### Faz 5 — İşlem Kataloğu | Bağımlılık: T-4.1 (T-4.3 ile paralel)

- **T-5.1** `defineAction({id, labelKey, inputSchema, outputSchema, capabilities, execute})` + registry.
- **T-5.2** İşlemler: record.{create, update, query, delete, upsert}, var.{set, compute}, contact.{tag, score}, message.send (rich), message.template, notify.{sms, email}, handoff.human, call.transfer, channel.switch, booking.{findSlots, reserve, cancel} (genel kaynak/slot), ai.{kbSearch, extract, classify, generate, summarize}, http.request (secret vault, retry, timeout, SSRF allowlist + private IP engeli), webhook.out, mcp.call, n8n.trigger, payment.link (adapter), consent.update.
- **T-5.3** Kullanıcı tanımlı işlem şablonları (makro) → araç tanımına derlenir.
- **T-5.4** (Opsiyonel, Faz 9 sonrası) code.run: QuickJS sandbox, CPU/bellek limiti, ağ yok.
- Kabul: her işlem için birim testi; http.request `127.0.0.1` / `169.254.169.254` reddi testi.

### Faz 6 — Bilgi Tabanı | Bağımlılık: T-1.5 (T-6.4 için ayrıca T-4.4)

- **T-6.1** Port (Bölüm 5 tablosu).
- **T-6.2** Koleksiyon kapsamı (tenant / agent / kanal).
- **T-6.3** Hibrit arama (vektör + FTS, RRF), opsiyonel reranker.
- **T-6.4** Embedding adapter (model/boyut metadata; yeniden güncelleme işi DBOS).
- **T-6.5** Kaynaklar: dosya (pdf/docx/txt/md/csv), URL, Soru-Cevap.
- **T-6.6** Context source: EntityType sorgusu + tetik Expr → sonuç prompt'a.
- **T-6.7** Konuşmalardan SSS önerisi.
- Kota kancası (T-11.3 ile bağlanır): tüm embedding / LLM çağrıları tek `recordUsage({tenantId, kind, model, tokens})` genişletme noktasından geçer. Kota yokken sınırsız çalışır; sınır sonradan T-11.3'te eklenir, çağrı noktaları değişmez.
- Kabul: voiceai'deki chunking testleri eşdeğeri; `lint:domain-terms` 0.

### Faz 7 — Mesaj Kanalları | Bağımlılık: T-4.1, T-5.1 (T-7.5 için ayrıca T-4.4)

- **T-7.1** `ChannelAdapter` arayüzü + `ConversationEvent` / `OutboundMessage` tipleri + capabilities.
- **T-7.2** WhatsApp: evolution, n8n-meta, meta-cloud adapter; HMAC / timing-safe verify; 24 saat penceresi + şablon fallback; `deploy/n8n` port.
- **T-7.3** Telegram: webhook + secret_token, inline klavye, sesli not → STT, sendMessageDraft streaming.
- **T-7.4** Web chat widget (WebSocket/SSE) + simülatör endpoint. Not: simülatör taşıyıcısı bu kartta hazırlandı; Deneme Ekranı'na bağlayan uç nokta T-10.12 ile gelir (yanıt üreticisi Faz 9'a bağlıdır).
- **T-7.5** Ortak conversation worker: opt-out algılama, AI duraklat, konuşma başına seri işleme (DBOS queue), araç döngü limiti (8), token kullanım kaydı.
- **T-7.6** Gelen Kutusu API'si | Bağımlılık: T-1.6, T-7.5
  - Konuşma işlemleri: üstlen (insana devir), asistana geri ver, atama (üye), durum (açık / bekliyor / çözüldü), okundu işareti, etiket.
  - İnsan yanıtı: seçili kanaldan gönderim (`OutboundMessage`), 24 saat penceresi / şablon kuralına uyum, gönderim durumu geri bildirimi.
  - Canlı güncelleme: yeni mesaj ve devir olayları için SSE akışı (kiracıya özel); yeniden bağlanmada kaçırılan olaylar imleçle alınır.
  - Üstlenilmiş konuşmada asistan otomatik yanıt vermez (T-7.5 AI duraklat ile aynı bayrak).
  - Kabul: devir → insan yanıtı → asistana geri verme akışı fixture kanalıyla geçer; iki üye aynı konuşmayı aynı anda üstlenemez; kiracı izolasyonu testi.
- Kabul: her adapter için kayıtlı payload fixture'larıyla parse/verify testleri.

### Faz 8 — Ses | Bağımlılık: T-4.1 (Faz 7 ile paralel)

- **T-8.1** `apps/voice-gateway`: AudioSocket TCP sunucu, resample 8k ↔ 16k/24k, stereo WAV kayıt, AMI transfer (voiceai `index.ts` + `asterisk-ami.ts` port).
- **T-8.2** RealtimeModelAdapter: gemini-live, openai-realtime; araç tanımı derleyiciden; barge-in, sessizlik sayacı.
- **T-8.3** WhatsApp Calling SIP → Asterisk dialplan şablonu.

**T-8.4 Web ses — çift transport** | Bağımlılık: T-8.2
- `WebVoiceTransport` arayüzü: connect / sendAudio / onAudio / onEvent / close; iki uygulama:
  - a) `livekit` (birincil): self-host LiveKit (docker-compose `voice` profili) veya LiveKit Cloud; WebRTC (Opus, jitter buffer, FEC, ICE/TURN), token sunucusu `/api/voice/web/token` (kısa ömürlü, oda = conversationId).
  - b) `websocket` (yedek): PCM16/Opus çerçeveleri; LiveKit kurulu değilse veya WebRTC başarısızsa otomatik geri düşüş.
- Seçim: tenant ayarı + istemci yetenek testi; env yoksa `websocket` varsayılan (zorunlu env yok).
- Kabul: LiveKit kapalıyken otomatik WebSocket'e düşer; %10 paket kaybı simülasyonunda konuşma kopmaz (LiveKit modu).

**T-8.5 Gelişmiş ses işleme** | Bağımlılık: T-8.4
- İstemci: tarayıcı AEC/NS/AGC açık; opsiyonel RNNoise (WASM) gürültü bastırma; mikrofon seviye göstergesi.
- Sunucu: Silero VAD + anlamsal tur algılama (turn detector modeli) → erken/geç kesme azaltma; barge-in (asistan konuşurken kullanıcı araya girince TTS anında durur, kesilen metin bağlama "yarım kaldı" olarak eklenir).
- Arka kanal ve dolgu: uzun araç çağrısında kısa "bir saniye bakıyorum" sesi (tenant ayarlı, kapatılabilir).
- Kabul: kesme gecikmesi p95 < 300 ms; araç çağrısı > 1.5 sn ise dolgu sesi çalar.

**T-8.6 Çift ses mimarisi (realtime + kademeli)** | Bağımlılık: T-8.2
- Mod A `realtime`: Gemini Live / OpenAI Realtime (speech-to-speech).
- Mod B `cascade`: akışlı STT (Deepgram / Google / Whisper adapter) → LLM (AI SDK) → akışlı TTS (ElevenLabs / Cartesia / Google adapter); cümle bazlı TTS akışı.
- Ajan bazında mod + ses + dil seçimi; otomatik dil algılama ve konuşma ortasında dil değiştirme.
- Telaffuz sözlüğü (marka/ürün adları) ve hız/ton ayarı.
- Kabul: iki modda aynı akış testi geçer; ilk ses yanıtı (TTFA) p50 < 800 ms raporu.

**T-8.7 Web görüşme deneyimi** | Bağımlılık: T-8.4, T-10.1
- Gömülebilir widget (`<script>` + web component), "Sesli konuş" butonu, bas-konuş ve sürekli dinleme modları.
- Canlı altyazı (kullanıcı + asistan), görüşme sırasında yazışmaya geçiş (aynı konuşma), buton/liste gibi zengin yanıt kartları ekranda.
- Ekran paylaşımı ve kamera (LiveKit modu; görsel girdi destekleyen modellerde) — opsiyonel bayrak.
- Opsiyonel konuşan avatar adapter (LiveKit avatar eklentileri).
- Telefona devam: "Beni arayın" → giden arama (voice-gateway) veya WhatsApp araması; bağlam korunur.
- Bağlantı kopunca otomatik yeniden bağlanma ve oturuma devam (30 sn pencere, aynı conversationId).
- **ERTELENDİ (bu sürümde YAPILMAYACAK):** İzin ve kayıt onayı ekranı (KVKK metni tenant ayarı, kayıt yalnız onayla). Bkz. Bölüm 8 ve 9. Bu sürümde web görüşmelerinde ses kaydı varsayılan KAPALI; kayıt kodu yazılmaz, yalnız `recordingConsent` için genişletme noktası (arayüz/bayrak) bırakılır.
- Erişilebilirlik: klavye ile kullanım, ekran okuyucu etiketleri, altyazı büyütme.
- Kabul: Chrome / Safari / Firefox + iOS / Android tarayıcı testleri; kopma sonrası 30 sn içinde devam.

**T-8.8 Ses kalite izleme** | Bağımlılık: T-8.4, T-11.1
- Görüşme başına metrikler: TTFA, tur gecikmesi, kesme sayısı, paket kaybı, jitter, MOS tahmini, sessizlik oranı.
- Studio "Görüşme Kalitesi" paneli (sade Türkçe: "Yanıt hızı", "Ses kalitesi", "Bağlantı durumu").
- Eşik aşımında uyarı; otomatik bağlantı/codec düşürme önerisi.
- Kabul: metrikler OpenTelemetry'ye akar; panel glossary kuralına uyar.

Faz 8 genel kabul: AudioSocket loopback testi; resample birim testleri; T-8.4 – T-8.8 kabulleri.

### Faz 9 — AI Özellikleri | Bağımlılık: Faz 3–5

- **T-9.1** AI Akış Mimarı: doğal dil → Flow IR (structured output) → derleyici doğrula → hata geri besle (en fazla 3 tur).
- **T-9.2** AI alan önerisi, AI koşul yazarı (Türkçe → AST), AI işlem yapılandırıcı (OpenAPI → http.request şablonu).
- **T-9.3** Çok ajanlı: router + uzman ajanlar, paylaşılan bağlam, devir kuralları; A2A opsiyonel.
- **T-9.4** Guardrail: konu dışı, PII maskeleme, prompt enjeksiyon filtresi; özet, duygu, etiketleme; anlamsal yanıt önbelleği.
- **T-9.5** Eval: senaryo dosyaları (`docs/evals/*.yaml`) + sentetik kullanıcı ajanı; yayın öncesi zorunlu.
- **T-9.6** Kişi verisi dışa aktarma ve silme | Bağımlılık: T-1.6, T-4.4, T-6.7, T-9.4
  - Dışa aktarma: bir kişinin kimlikleri, izinleri, konuşmaları, mesajları, ona bağlı kayıtları ve alanları tek paket (Türkçe başlıklı CSV + makine okunur dosya) olarak üretilir; büyük kişiler DBOS işi olarak arka planda, indirme bağlantısı süreli.
  - Silme: iki mod — tam silme veya anonimleştirme (mesaj gövdesi ve PII alanları silinir, sayaç ve istatistik kalır). Kapsam: `contacts`, `contact_identities`, `contact_consents`, `conversations`, `messages`, ona bağlı `records` (PII alanları), `flow_sessions`, Redis oturum önbelleği, bilgi tabanı SSS önerileri, anlamsal yanıt önbelleği, embedding'ler.
  - Yalnız `owner`/`admin`; silme onaylı ve geri alınamaz uyarılıdır; her talep `data_requests` kaydına (kim, ne zaman, kapsam, sonuç) yazılır ve silinen içerik bu kayda kopyalanmaz.
  - Açık oturum / bekleyen iş olan kişi için önce işler iptal edilir.
  - Kabul: silinen kişinin verisi yukarıdaki tüm depolarda bulunamaz (test her depoyu tek tek sorgular); başka kişiler ve başka kiracı etkilenmez; dışa aktarma boş kişi ve çok mesajlı kişi için geçer; `lint:domain-terms` 0.
- Kota kancası: Faz 9'daki her LLM çağrısı Faz 6'daki `recordUsage` noktasından geçer (T-11.3 ile bağlanır).

### Faz 10 — Studio | Bağımlılık: T-1.4, T-1.5 + her ekran için ilgili fazın API kartı (T-10.9: T-1.6; T-10.10: T-1.6 + T-7.6; T-10.13: T-9.6; üyeler ekranı: T-1.6); Bölüm 4 zorunlu

- **T-10.1** glossary + tema tokenları + InfoTooltip + ortak bileşenler (`packages/ui`).
- **T-10.2** Kayıt Türleri ve Bilgi Alanları ekranı.
- **T-10.3** Koşul Oluşturucu (görsel + cümle modu + canlı önizleme).
- **T-10.4** İşlemler ekranı.
- **T-10.5** Akış Tuvali (xyflow, elkjs, adım doğrulama rozetleri).
- **T-10.6** Yayın Öncesi Kontrol (sade özet; ham çıktı yalnız Geliştirici modu).
- **T-10.7** Sürümler.
- **T-10.8** Bilgi Tabanı.
- **T-10.9** Kanallar (adım adım sihirbaz).
- **T-10.10** Gelen Kutusu (insana devir).
- **T-10.11** Asistanlar.
- **T-10.12** Deneme Ekranı (simülatör).
- **T-10.13** Kişi Verisi Yönetimi (dışa aktar / sil) ve Ekip & Davetler ekranı: onay penceresi, sade uyarılar, işlem geçmişi.
- Kabul: `lint:ui-terms` 0; açık/koyu tema görsel kontrol; tüm metinler glossary'den.

### Faz 11 — Gözlemlenebilirlik | Bağımlılık: Faz 4

- **T-11.1** OpenTelemetry span: adım, işlem, LLM çağrısı.
- **T-11.2** Opsiyonel Langfuse.
- **T-11.3** Tenant token/maliyet kotası. Bilinçli olarak sona bırakıldı; Faz 6 ve 9'da bırakılan `recordUsage` noktasına bağlanır (çağrı noktaları değişmez), aylık sınır + uyarı eşiği + sade Türkçe "kota doldu" davranışı. Kabul: sınır aşımında çağrı reddedilir, diğer kiracılar etkilenmez.
- **T-11.4** Denetim kaydı.
- **T-11.5** Dağıtım: her uygulama için Dockerfile, `docker-compose.prod.yml`, sağlık kontrolleri, giriş betiği (migration idempotent; hata container'ı çökertmez, sağlık kontrolünde görünür), Dokploy uyumu, `.env.example` güncel.
- Kabul: temiz makinede `docker compose -f docker-compose.prod.yml up` ile tüm servisler sağlıklı; env'siz başlatmada çökme yok.

## 7. Genel Doğrulama (her faz sonunda)

1. `bun run typecheck && bun run lint && bun test` exit 0
2. `bun run db:migrate` iki kez exit 0
3. `bun run lint:domain-terms` 0 bulgu; `bun run lint:ui-terms` 0 bulgu
4. Uçtan uca: sektörden bağımsız örnek şablon "Talep toplama + rezervasyon" → web, WhatsApp (fixture), Telegram (fixture) simülasyonu geçer
5. Ses: Asterisk + softphone gelen arama, araç çağrısı, aktarım (manuel)

## 8. Kapsam Dışı

- Klinik modülleri (odontogram, tedavi planı, finans, CBCT), `template-uikit`, `gemini-live-test`, voiceai veri göçü (yalnız kod taşınır).
- Ertelenen: Web görüşme KVKK / kayıt onayı ekranı (T-8.7 alt maddesi). Ajanlar bu özelliği UYGULAMAZ; yalnız genişletme noktası bırakır.

## 9. Açık Konular

1. Artifact teslimi: DB'de runtime modül (önerilen) + CLI ile SDK/DDL dışa aktarım (hibrit) — varsayılan budur.
2. code.run (QuickJS) Faz 9 sonrası.
3. Web ses: KARAR VERİLDİ — LiveKit birincil + WebSocket otomatik yedek (T-8.4 – T-8.8).
4. Sonraki sürüm: Web görüşme KVKK aydınlatma + kayıt onayı (tenant ayarlı metin, onay kaydı `contact_consents`'e, onaysız kayıt yok).
5. Evolution API resmi olmayan WhatsApp Web bağlantısı kullanır; numara engellenme ve kullanım koşulu riski vardır. Arayüzde "önerilmez" olarak işaretlenir; varsayılan Meta Cloud.
6. DBOS'un Bun uyumu (Bölüm 3 runtime riski) T-4.4'te netleşir.
