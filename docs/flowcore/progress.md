# FlowCore — İlerleme

Plan durumu: **ONAYLANDI**

| Kart | Durum | Değişen dosyalar | Doğrulama | Tarih | Ajan/IDE |
|---|---|---|---|---|---|
| T-0.0 | DONE | docs/flowcore/{README,plan,AGENTS,GEMINI,CLAUDE,progress,decisions,glossary}.md, docs/flowcore/prompts/start.md | Dosyalar mevcut; `git status` yalnız docs/flowcore/ | 2026-11-06 | VS Code Copilot |
| T-0.1 | DONE | package.json, turbo.json, biome.json, tsconfig.base.json, tsconfig.json, .env.example, docker-compose.yml, AGENTS.md, GEMINI.md, CLAUDE.md, docs/**, apps/{api,studio,voice-gateway,worker}/**, packages/{core,ir,compiler,runtime,actions,knowledge,channels,voice,ai,db,ui,sdk-generated}/** | `bun install && bun run typecheck && bun run lint && bun test` exit 0 (16/16 paket, 16/16 test) | 2026-11-06 | Antigravity |
| T-0.1 | DONE | turbo.json, tsconfig.base.json, tsconfig.json; iki progress.md kopyası | Codex yeniden doğrulama: dosya sonlarındaki fazla boş satırlar giderildi; kurulum, önbelleksiz typecheck (16/16), lint (69 dosya), test (16/16) ve Compose yapılandırma kontrolü exit 0 | 2026-11-06 | Codex |
| T-0.2 | DONE | package.json, tsconfig.json, scripts/{db-migrate,lint-domain-terms,lint-ui-terms}.ts, scripts/lib/source-files.ts, scripts/test/term-lints.test.ts; iki progress.md kopyası | Önbelleksiz typecheck (16/16 paket + betikler), üç lint komutu, 25/25 test exit 0; db:migrate iki kez açık atlama bildirimiyle exit 0 | 2026-11-07 | Codex |
| T-1.1 | DONE | packages/db/{package.json,src/index.ts,src/credentials.ts,src/schema/**,test/credentials.test.ts,test/schema.test.ts}, bun.lock, .env.example, docs/database-schema.md, docs/decisions.md; belge kopyaları | Kilitli kurulum, önbelleksiz typecheck (16/16 paket + betikler), üç lint ve 39/39 test exit 0; Drizzle DDL PostgreSQL 17.5 üzerinde doğrulandı | 2026-11-07 | Codex |
| T-1.2 | DONE | packages/db/src/schema/{entities,index}.ts, packages/db/test/{entities,schema}.test.ts, docs/{dynamic-entities,database-schema,decisions,README,progress}.md; belge kopyaları | Kilitli kurulum, önbelleksiz typecheck (16/16 paket + betikler), üç lint ve 50/50 test exit 0; PostgreSQL 17.5 üzerinde şema/GIN/RLS testleri | 2026-11-07 | Codex + 3 alt ajan |
| T-1.3 | DONE | packages/db/src/{connection,ensure,migrate,seed}.ts, src/migrations/core-schema.ts, scripts/generate-core-schema.ts, test/migrations.test.ts, root CLI ve belgeler | db:check, 16/16 typecheck, üç lint,59/59 test exit0; gerçek PostgreSQL17.11 üzerinde migrate2+seed2 exit0; veri sayıları tekil | 2026-11-07 | Codex + 3 alt ajan |
| T-1.4 | DONE | DB auth/isolation/session şeması, HTTP oturum yolları, migrasyon entegrasyonu ve testler | Argon2id/oturum/RLS+rol+HTTP testleri; gerçek PostgreSQL paralel kiracı testi; full95/95 ve type/lint exit0 | 2026-11-07 | Codex + 3 alt ajan |
| T-1.5 | DONE | apps/api/src/{app,resources,server,index}.ts, HTTP testleri, package bağımlılıkları ve belgeler | Altı kaynak+organizasyon CRUD, OpenAPI,health; full95/95 exit0; gerçekHTTP+PG17.11 CRUD/version409/tenant403/logout401 geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-1.6 | DONE | Kanal/konuşma/üyelik HTTP yolları, DB memberships.ts, invitations şeması, erişim/migrasyon ve testler; verify-tenant-api.ts, belgeler | 302/302 test, 16/16 typecheck, lint/terim/DDL denetimi; gerçek PG+HTTP kiracı/kimlik bilgisi/imleç/davet ve eşzamanlı son sahip kabulü geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-2.1 | DONE | packages/ir/src/expr/ast.ts, packages/ir/src/index.ts, packages/ir/test/expr-ast.test.ts, docs/decisions.md; ilerleme kopyası | 16/16 paket typecheck, Biome 104 dosya, domain 94 dosya/0 bulgu, UI 0 bulgu, 112/112 test (1231 assertion) exit 0 | 2026-11-07 | GitHub Copilot |
| T-2.2 | DONE | packages/ir/src/expr/{evaluate,safe-regex}.ts, packages/ir/src/index.ts, packages/ir/test/{evaluate,safe-regex}.test.ts; lint düzeltmesi: turkish.ts | 16/16 paket typecheck, Biome 114 dosya, domain 103 dosya/0 bulgu, UI 0 bulgu, 149/149 test (1860 assertion), verify:phase1 exit 0 | 2026-11-07 | GitHub Copilot + önceki ajanlar |
| T-2.3 | DONE | packages/ir/src/expr/turkish.ts, packages/ir/src/index.ts, packages/ir/test/{turkish,index}.test.ts; belge kopyaları | 16/16 paket typecheck, Biome 114 dosya, domain 103 dosya/0 bulgu, UI 0 bulgu, 150/150 test (1861 assertion) exit 0 | 2026-11-07 | GitHub Copilot + önceki ajanlar |
| T-2.4 | DONE | packages/ir/src/expr/{context,system-variables}.ts, packages/ir/src/index.ts, packages/ir/test/{context,index}.test.ts; belge kopyaları | 16/16 paket typecheck, Biome 115 dosya, domain 104 dosya/0 bulgu, UI 0 bulgu, 159/159 test (1963 assertion) exit 0 | 2026-11-07 | GitHub Copilot + önceki ajanlar |
| T-2.5 | DONE | packages/ir/test/expr-compat.test.ts; belge kopyaları | Akış koşul operatörleri, Türkçe parse/describe/parse döngüsü ve sistem değişkenleri uyumluluk testleri; 161/161 test exit 0 | 2026-11-07 | Antigravity |
| T-3.1 | DONE | packages/compiler/src/{ir,validate}.ts, packages/compiler/test/ir-validate.test.ts | FieldIR, EntityTypeIR, ActionIR, FlowIR normalize + sha256 hash; erişilemeyen adım, sonsuz döngü ve kopuk çıkış denetimi (3/3 test) exit 0 | 2026-11-07 | Antigravity |
| T-3.2 | DONE | packages/compiler/src/targets/js.ts, packages/compiler/test/expr-targets.test.ts | Expr → saf JS fonksiyon derleyicisi, LRU önbellek, enjeksiyon güvenliği, 10.000 rastgele AST fuzz testi (`evaluate == compiled fn` %100 eşleşme) ve 1M değerlendirme benchmarkı (~613ms / ~1.63M ops/sn) exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.3 | DONE | packages/compiler/src/targets/sql.ts, packages/compiler/test/expr-targets.test.ts | Expr → parametreli PostgreSQL `WHERE` derleyicisi (`$1..$n`), JSONB yol çıkarımı, `columnMap` indeks yönlendirmesi, SQL enjeksiyonu ve PGlite (PostgreSQL 17) üzerinde `evaluate == SQL WHERE` eşdeğerlik testi exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.4 | DONE | packages/compiler/src/targets/schema.ts, packages/compiler/test/expr-targets.test.ts | 12 alan türü ve dinamik varlıklar için çalışma zamanı Zod şeması, deterministik JSON Schema (Draft 2020-12) ve TypeScript kaynak üretimi exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.5 | DONE | packages/compiler/src/targets/tools.ts, packages/compiler/test/flow-targets.test.ts | ActionIR → Gemini (`functionDeclarations`), OpenAI (`function`), Anthropic (`input_schema`) ve MCP (`inputSchema`) araç şeması üretimi exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.6 | DONE | packages/compiler/src/targets/state-machine.ts, packages/compiler/test/flow-targets.test.ts | FlowIR → saf ve yan etkisiz durum makinesi modülü (`CompiledStateMachine`), öncelikli geçişler, `Condition`, `IntentRouter` ve `Goto` yürütmesi exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.7 | DONE | packages/compiler/src/targets/prompt.ts, packages/compiler/test/flow-targets.test.ts | Adım bazlı, belirteç bütçeli (`maxTokensPerStep`, `maxTotalTokens`) Türkçe sistem yönergesi parçaları ve monotonik kırpma exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.8 | DONE | packages/compiler/src/targets/ddl.ts, packages/compiler/test/ddl-sdk.test.ts | İndeksli alanlar için `GENERATED ALWAYS AS ... STORED` + B-Tree/GIN indeksleri, fiziksel tablo üretimi, dry-run diff ve PostgreSQL 17 (PGlite) üzerinde 2x idempotent `applyEntityDdl` exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.9 | DONE | packages/compiler/src/targets/sdk.ts, scripts/flowcore.ts, package.json, packages/compiler/test/ddl-sdk.test.ts | `types.ts`, `client.ts` ve `openapi.json` (OpenAPI 3.1.0) üretimi; `bun run flowcore codegen pull --tenant <id>` CLI komutu exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-3.10 | DONE | packages/db/src/schema/{flows,index}.ts, packages/db/src/isolation.ts, packages/db/src/migrations/core-schema.ts, packages/compiler/src/{pipeline,index}.ts, apps/api/src/routes/flows.ts, apps/api/src/app.ts, packages/compiler/test/{pipeline,golden}.test.ts, apps/api/test/flows-http.test.ts | `flows`, `flow_versions`, `artifacts` tabloları (toplam 18 tablo), DB seviyesinde değişmez (immutable) yayın hattı, simülasyon, geri alma (rollback), çalışan oturum sürüm sabitleme, 9 hedef golden snapshot ve HTTP/OpenAPI testleri; 16/16 typecheck, Biome 137 dosya, domain 125 dosya/0 bulgu, UI 0 bulgu, 2x db:migrate + 2x db:seed, 193/193 test (12.397 assertion) exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-4.1 | DONE | packages/runtime/src/{engine,machines,session,index}.ts ve motor/oturum/yükleyici testleri | Olay tekilleştirme, revizyon, completedActions, sürüm sabitleme; tam 236/236 test ve gerçek PostgreSQL kabulü exit 0 | 2026-11-07 | Codex + 3 alt ajan |
| T-4.2 | DONE | packages/runtime/src/store.ts, packages/db/src/schema/{sessions,index}.ts, isolation.ts, migrations/core-schema.ts, depo/oturum testleri | 19 tablo, tenant RLS, CAS, atomik etki+checkpoint, Redis özeti/commit/rollback; 12 eşzamanlı gerçek oturum geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-4.3 | DONE | packages/runtime/src/engine.ts, packages/runtime/test/engine.test.ts | Tüm adım türleri; yeniden sorma, alt akış, döngü, paralel birleşme/çatışma, sabit son tarih; motor 19/19 test exit 0 | 2026-11-07 | Codex + 3 alt ajan |
| T-4.4 | DONE | apps/worker/**, scripts/verify-phase4{,-runtime,-durable}.ts, package.json, bun.lock ve belgeler | DBOS 5.4.0/Bun 1.3.13; gerçek SIGKILL sonrası 5 iş, 2 deneme/1 etki, kurtarma 2240 ms; gerçek Redis + motor köprüsü geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-5.1 | DONE | packages/core/src/{secrets,index}.ts, packages/core/test/secrets.test.ts, packages/actions/package.json, packages/actions/src/{define,registry,index}.ts, packages/actions/test/registry-and-macros.test.ts | AES-256-GCM SecretVault (sabit anahtarsız, D-12 uyumlu), `defineAction`, `ActionRegistry`, idempotency tekilleştirmesi ve `@flowcore/runtime` `createRuntimeHook` köprüsü; 30/30 derleyici işlem kimliği eşleşmesi | 2026-11-07 | Antigravity + 3 alt ajan |
| T-5.2 | DONE | packages/actions/src/ssrf.ts, packages/actions/src/builtins/{data-and-booking,comm-and-ai,integrations}.ts, packages/actions/test/{builtins-all,ssrf-and-http}.test.ts | 30 yerleşik işlem (`record.*`, `var.*`, `contact.*`, `consent.update`, `booking.*`, `message.*`, `notify.*`, `handoff.human`, `call.transfer`, `channel.switch`, `ai.*`, `http.request`, `webhook.out`, `mcp.call`, `n8n.trigger`, `payment.link`), PGlite PG17 testi ve `127.0.0.1` / `169.254.169.254` / DNS rebinding / 302 redirect SSRF engelleme testleri exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-5.3 | DONE | packages/actions/src/macros.ts, packages/actions/test/registry-and-macros.test.ts | Kullanıcı tanımlı işlem şablonları (makrolar): dinamik Zod şeması, sıralı adım yürütmesi (`{{param.*}}`, `{{step.*}}`, `{{field.*}}`) ve `@flowcore/compiler` ile Gemini/OpenAI/Anthropic/MCP araç şeması derlemesi; 250/250 test (12.789 assertion) exit 0 | 2026-11-07 | Antigravity + 3 alt ajan |
| T-6.1 | DONE | packages/knowledge/src/{chunk,cache,repository,search,extract,errors}.ts ve port testleri | Kaynak bölümleyici için 7 nötr eşdeğer örnek; bölümleme/çıkarma/özet/önbellek testleri; tam 285/285 test exit 0 | 2026-11-07 | Codex + 3 alt ajan |
| T-6.2 | DONE | packages/db/src/schema/knowledge.ts, tenancy.ts, isolation.ts, migrations/core-schema.ts, knowledge/types.ts ve repository.ts | 5 yeni tablo, toplam 24 tablo; tenant RLS, bileşik FK, genel/asistan/kanal kapsamı; gerçek PostgreSQL ve HTTP kabulü geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-6.3 | DONE | packages/knowledge/src/{search,repository,action-adapter,retrieval}.ts ve arama testleri | Gerçek pgvector kosinüs + Türkçe FTS, RRF, yetkili reranker ve süre aşımı; model/boyut ayrımı ve anahtarsız FTS geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-6.4 | DONE | packages/knowledge/src/{embed,indexing}.ts, apps/api/src/knowledge-jobs.ts, apps/worker/src/knowledge.ts ve durable.ts, verify-phase6*.ts | Gemini protokolü/model/boyut, DBOS kuyruğu, revision+indexToken CAS; gerçek SIGKILL sonrası 2 model denemesi/1 son bölüm, kurtarma 1384 ms | 2026-11-07 | Codex + 3 alt ajan |
| T-6.5 | DONE | packages/knowledge/src/{extract,sources}.ts, API knowledge yolları, bağımlılıklar ve testler | Gerçek PDF/DOCX ikili dosyaları, txt/md/csv, URL, Soru-Cevap; DNS sabitleme/SSRF/yönlendirme/boyut/süre ve multipart HTTP testleri geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-6.6 | DONE | packages/knowledge/src/{context-source,retrieval}.ts ve testler; API yolları | EntityType sorgusu + Expr tetik/filtre, parametreli SQL, hassas alan dışlama, kapsam ve sınırlı prompt; gerçek kayıt → prompt kabulü geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-6.7 | DONE | packages/knowledge/src/faq.ts ve context-faq.test.ts; API öneri/onay/ret yolları | Kapalı konuşma/tamamlanmış soru-yanıt, kapsam, maskeleme, tekrarsız sıklık, onayla atomik QA kaynak üretimi; gerçek PostgreSQL/HTTP geçti | 2026-11-07 | Codex + 3 alt ajan |
| T-7.1 | DONE | packages/channels/src/{types,util,registry,index}.ts, test/core.test.ts, packages/core/src/{usage,consent}.ts | Ortak kanal sözleşmesi, zamanlama güvenli karşılaştırma, telefon/vazgeçme/pencere yardımcıları, kayıt defteri; kullanım kaydı kancası (`recordUsage`); testler geçti | 2026-11-07 | Claude + alt ajanlar |
| T-7.2 | DONE | packages/channels/src/whatsapp/**, test/whatsapp/**, deploy/n8n/** | evolution / n8n-meta / meta-cloud; imza ve zaman damgası doğrulaması, 24 saat penceresi + şablon, SSRF reddi, hata eşlemesi; 89 test | 2026-11-07 | Claude + alt ajanlar |
| T-7.3 | DONE | packages/channels/src/telegram/**, test/telegram/** | Gizli anahtarlı webhook, satır içi klavye, sesli not→metin, akış, hata eşlemesi, token sızıntı testi; 33 test | 2026-11-07 | Claude + alt ajanlar |
| T-7.4 | DONE | packages/channels/src/web/**, test/web/**, apps/api/src/routes/web-chat.ts, test | Ziyaretçi belirteci, çerçeve şeması, SSE (tablo kuyruklu), kaynak izni, hız sınırı, simülatör taşıyıcısı; ziyaretçi anahtarı bağlantıda otomatik üretilir | 2026-11-07 | Claude + alt ajanlar |
| T-7.5 | DONE | packages/runtime/src/conversation-{worker,store,ingest}.ts, apps/worker/src/conversation*.ts, apps/api/src/{conversation-jobs,routes/webhooks}.ts, packages/channels/src/connection/** | Vazgeçme, duraklatma, seri işleme (kiralamalı kilit), araç döngüsü 8, kullanım kaydı, DBOS kuyruğu, webhook uçları; `verify:phase7:durable` gerçek PostgreSQL+DBOS geçti | 2026-11-07 | Claude + alt ajanlar |
| T-7.6 | DONE | packages/runtime/src/conversation-inbox.ts, apps/api/src/routes/inbox.ts, testler | Üstlen / geri ver / ata / durum / okundu / etiket / insan yanıtı / canlı olay akışı; kiracı izolasyonu ve rol testleri geçti | 2026-11-07 | Claude + alt ajanlar |
| T-8.1 | DONE | packages/voice/src/audio/**, apps/voice-gateway/src/{audiosocket-server,ami,recorder}.ts | AudioSocket TCP sunucu (127.0.0.1 loopback testi), 8k↔16k/24k yeniden örnekleme, stereo WAV, AMI transfer; testler exit 0 | 2026-11-07 | Claude + alt ajanlar |
| T-8.2 | DONE | packages/voice/src/realtime/** | Gemini Live ve OpenAI Realtime adapter, derleyiciden araç tanımı, barge-in, sessizlik sayacı; anahtar sızıntısı testi | 2026-11-07 | Claude + alt ajanlar |
| T-8.3 | DONE | packages/voice/src/telephony/dialplan.ts, infra/asterisk/*-whatsapp.conf.tmpl | WhatsApp Calling SIP → Asterisk dialplan şablonu | 2026-11-07 | Claude + alt ajanlar |
| T-8.4 | DONE | packages/voice/src/web/**, apps/api/src/routes/voice-web.ts | LiveKit birincil + WebSocket yedek; kapalıyken otomatik düşüş, %10 paket kaybında kopmama, jeton süre/oda doğrulaması | 2026-11-07 | Claude + alt ajanlar |
| T-8.5 | DONE | packages/voice/src/processing/** | VAD, anlamsal tur algılama, kesme p95 < 300 ms, 1,5 sn üzeri araç çağrısında dolgu sesi; tarayıcı tarafı (AEC/RNNoise) T-8.7 ile gelir | 2026-11-07 | Claude + alt ajanlar |
| T-8.6 | DONE | packages/voice/src/cascade/** | STT→LLM→TTS kademeli mod, cümle bazlı TTS, dil algılama, telaffuz sözlüğü; iki modda ortak akış testi, TTFA p50 450 ms | 2026-11-07 | Claude + alt ajanlar |
| T-8.7 | DONE | packages/voice/src/widget/{voice-widget,index}.ts, packages/voice/src/index.ts, packages/voice/test/web-widget.test.ts | Gömülebilir `<flowcore-voice-widget>` ve `VoiceWidgetController`, `"Sesli konuş"`, bas-konuş/sürekli dinle, canlı altyazı, aynı `conversationId` ile yazışmaya geçiş, zengin kartlar, ekran/kamera paylaşımı bayrakları + `VoiceAvatarAdapter`, `"Beni arayın"` geri arama devri, 30 sn otomatik yeniden bağlanma, klavye/erişilebilirlik ve varsayılan `recordingEnabled: false` (`recordingConsent?: boolean` genişletme noktası); 7/7 test exit 0 | 2026-11-07 | Antigravity + alt ajan |
| T-8.8 | DONE | packages/voice/src/quality/{monitor,index}.ts, packages/voice/src/index.ts, packages/ui/src/glossary/voice-quality.ts, packages/ui/src/glossary.ts, apps/studio/src/lib/nav.ts, apps/studio/src/features/voice-quality/{logic.ts,VoiceQualityPanel.tsx}, apps/studio/app/gorusme-kalitesi/page.tsx, packages/voice/test/quality-monitor.test.ts, apps/studio/test/voice-quality.test.ts | Görüşme başına TTFA, tur gecikmesi, kesme sayısı, paket kaybı, gecikme dalgalanması, ITU-T G.107 E-model MOS tahmini ve sessizlik oranı; eşik uyarıları ve otomatik ses/bağlantı düşürme önerisi; OpenTelemetry span akışı ve Studio `"Görüşme Kalitesi"` (`/gorusme-kalitesi`) paneli | 2026-11-07 | Antigravity + alt ajan |
| T-9.1 | DONE | packages/ai/src/architect/**, packages/ai/src/llm.ts | Doğal dil → Flow IR, derleyici doğrulaması, hata geri besleme (en çok 3 tur), bozuk JSON/bilinmeyen eylem testleri | 2026-11-07 | Claude + alt ajanlar |
| T-9.2 | DONE | packages/ai/src/assist/** | Alan önerisi, Türkçe koşul yazarı (parseTr doğrulamalı), OpenAPI → http.request şablonu (sır değeri yazılmaz) | 2026-11-07 | Claude + alt ajanlar |
| T-9.3 | DONE | packages/ai/src/multiagent/** | Router + uzman ajanlar, paylaşılan bağlam, devir kuralları, devir sınırı 4, A2A arayüzü (ağ yok) | 2026-11-07 | Claude + alt ajanlar |
| T-9.4 | DONE | packages/ai/src/guardrails/** | Konu dışı, PII (TC kimlik/Luhn/IBAN), enjeksiyon filtresi, özet/duygu/etiket, anlamsal yanıt önbelleği | 2026-11-07 | Claude + alt ajanlar |
| T-9.5 | DONE | packages/ai/src/eval/**, docs/evals/**, apps/api/src/{app,routes/flows}.ts | YAML senaryolar, sentetik kullanıcı, yayın kapısı (`evalGate`, 409 `EVAL_GATE_FAILED`); verilmezse yayın davranışı değişmez | 2026-11-07 | Claude + alt ajanlar |
| T-9.6 | DONE | packages/db/src/schema/privacy.ts, packages/ai/src/privacy/**, apps/api/src/routes/privacy.ts, apps/worker/src/privacy.ts, docs/privacy.md | `data_requests` + `semantic_cache` (27 tablo); dışa aktarma, tam silme, anonimleştirme; tüm depolar tek tek sorgulanarak doğrulandı; owner/admin, onaylı silme | 2026-11-07 | Claude + alt ajanlar |
| T-10.1 | DONE | packages/ui/**, apps/studio/{package.json,tsconfig.json,next.config.mjs,app/layout.tsx,app/page.tsx,app/giris/page.tsx,src/components/**,src/lib/**,src/features/shared/**,test/shell.test.ts}, scripts/lint-ui-terms.ts | Ortak Türkçe sözlük (`glossary.ts` + `glossary/*.ts`), açık/koyu tema değişkenleri (`theme.css`), Clay/Neo gölge sistemi (`depth.module.css`), `InfoTooltip` ve temel bileşenler; Next.js 16 + React 19 Studio kabuğu ve geliştirici modu kapısı | 2026-11-07 | Antigravity + alt ajan |
| T-10.2 | DONE | packages/ui/src/glossary/entity-types.ts, apps/studio/src/features/entity-types/{logic.ts,EntityTypesView.tsx}, apps/studio/app/kayit-turleri/page.tsx, apps/studio/test/entities-conditions-actions.test.ts | Dinamik kayıt türleri ve 12 alan türü yönetimi, otomatik güvenli anahtar üretimi, arama süzgeci, hesaplanan alan cümle önizlemesi ve 409 sürüm çakışması uyarısı | 2026-11-07 | Antigravity + alt ajan |
| T-10.3 | DONE | packages/ui/src/glossary/conditions.ts, apps/studio/src/features/conditions/{logic.ts,ConditionBuilderView.tsx}, apps/studio/app/kosullar/page.tsx, apps/studio/test/entities-conditions-actions.test.ts | Görsel mod (`ve`/`veya` grupları, `[Etiket]` değişken çipleri), Cümle modu (`parseTr`/`describeTr` çift yönlü dönüşüm) ve Canlı Önizleme (`evaluate`) | 2026-11-07 | Antigravity + alt ajan |
| T-10.4 | DONE | packages/ui/src/glossary/actions.ts, apps/studio/src/features/actions/{logic.ts,ActionsView.tsx}, apps/studio/app/islemler/page.tsx, apps/studio/test/entities-conditions-actions.test.ts | 30 yerleşik işlem kataloğu, girdi alanları, `"Bağlantı anahtarı seç"` seçicisi (ham `{{secret:...}}` sızıntısı olmadan) ve 3 adımlı işlem şablonu (makro) oluşturucu | 2026-11-07 | Antigravity + alt ajan |
| T-10.5 | DONE | packages/ui/src/glossary/flow-canvas.ts, apps/studio/src/features/flows/{contracts.ts,api.ts,graph.ts,layout.ts,FlowCanvasView.tsx}, apps/studio/app/akislar/page.tsx, apps/studio/test/flows-canvas-versions.test.ts | `@xyflow/react` akış tuvali, `elkjs` otomatik yerleşim, adım doğrulama rozetleri (`Bu adıma ulaşılamıyor`, `Çıkış bağlantısı eksik`, `Sonsuz döngü riski`, `Koşul dalı eksik`) ve sağ yan adım ayarları paneli | 2026-11-07 | Antigravity + alt ajan |
| T-10.6 | DONE | packages/ui/src/glossary/publish-check.ts, apps/studio/src/features/flows/PublishCheckPanel.tsx, apps/studio/test/flows-canvas-versions.test.ts | Sade Türkçe doğrulama özeti, `"Sorunu göster"` ile tuval adımına odaklanma, deneme senaryoları ve değerlendirme kapısı (`evalGate`) özeti, yalnız hata 0 iken etkinleşen `"Yayınla"` düğmesi | 2026-11-07 | Antigravity + alt ajan |
| T-10.7 | DONE | packages/ui/src/glossary/versions.ts, apps/studio/src/features/flows/{diff.ts,VersionsView.tsx}, apps/studio/app/surumler/page.tsx, apps/studio/test/flows-canvas-versions.test.ts | Sürüm geçmişi, iki sürüm arası sade Türkçe fark özeti (`describeTr`), `ConfirmModal` ile geri alma onayı ve aktif konuşmaların başladıkları sürümde tamamlanacağını açıklayan `InfoTooltip` | 2026-11-07 | Antigravity + alt ajan |
| T-10.8 | DONE | packages/ui/src/glossary/knowledge.ts, apps/studio/src/features/knowledge/{logic.ts,KnowledgeView.tsx}, apps/studio/app/bilgi-tabani/page.tsx, apps/studio/test/knowledge-channels-inbox.test.ts | Koleksiyonlar, dosya/bağlantı/Soru-Cevap kaynak ekleme, `"Bilgi tabanını güncelle"`, `"Bu soruya ne bulur?"` arama denemesi, SSS önerisi onay/ret ve bağlam kaynağı kartı | 2026-11-07 | Antigravity + alt ajan |
| T-10.9 | DONE | packages/ui/src/glossary/channels.ts, apps/studio/src/features/channels/{logic.ts,ChannelsView.tsx}, apps/studio/app/kanallar/page.tsx, apps/studio/test/knowledge-channels-inbox.test.ts | WhatsApp (3 bağlantı yöntemi), Telegram ve web sohbet için 3 adımlı kurulum sihirbazı, maskeli `"Bağlantı anahtarı"`, eksik güvenlik anahtarı uyarısı ve bağlantı testi | 2026-11-07 | Antigravity + alt ajan |
| T-10.10 | DONE | packages/ui/src/glossary/inbox.ts, apps/studio/src/features/inbox/{logic.ts,InboxView.tsx}, apps/studio/app/gelen-kutusu/page.tsx, apps/studio/test/knowledge-channels-inbox.test.ts | Kanal/durum/kişi/tarih süzgeçli ve imleç sayfalamalı konuşma listesi, `sequence` sıralı mesaj akışı, `"Konuşmayı üstlen"` / `"Asistana geri ver"`, `"Bildirimleri kapattı"` rozeti ve insan yanıt kutusu | 2026-11-07 | Antigravity + alt ajan |
| T-10.11 | DONE | packages/ui/src/glossary/agents.ts, apps/studio/src/features/agents/{drafts.ts,AgentsView.tsx}, apps/studio/app/asistanlar/page.tsx, apps/studio/test/agents-simulator-privacy-team.test.ts | Asistan listesi, ekleme/düzenleme/silme, karşılama mesajı, konuşma üslubu, yanıt sıcaklığı, ses tercihi, bağlı akış ve bilgi koleksiyonları seçimi | 2026-11-07 | Antigravity + alt ajan |
| T-10.12 | DONE | packages/ui/src/glossary/simulator.ts, apps/studio/src/features/simulator/{logic.ts,SimulatorView.tsx}, apps/studio/app/deneme-ekrani/page.tsx, apps/studio/test/agents-simulator-privacy-team.test.ts | Sohbet akışı, geçerli adım ve `[Etiket]` çipleriyle toplanan bilgiler paneli, elle bilgi verme, `"Baştan başla"` sıfırlama ve geliştirici modunda ham olay günlüğü | 2026-11-07 | Antigravity + alt ajan |
| T-10.13 | DONE | packages/ui/src/glossary/{contact-data.ts,team.ts}, apps/studio/src/features/contact-data/{api.ts,logic.ts,ContactDataView.tsx}, apps/studio/src/features/team/{api.ts,logic.ts,TeamView.tsx}, apps/studio/app/{kisi-verisi,ekip-ve-davetler}/page.tsx, apps/studio/test/agents-simulator-privacy-team.test.ts | Kişi verisi dışa aktarma, anonimleştirme, `ConfirmModal` onaylı tam silme ve işlem geçmişi (`/kisi-verisi`); ekip üyeleri, son sahip koruması ve tek seferlik davet anahtarı yönetimi (`/ekip-ve-davetler`) | 2026-11-07 | Antigravity + alt ajan |
| T-11.1 | DONE | packages/core/src/telemetry.ts, packages/core/src/index.ts, packages/runtime/src/engine.ts, packages/actions/src/registry.ts, packages/ai/src/llm.ts, packages/core/test/observability-quota-audit.test.ts | OpenTelemetry span kaydı (`withStepSpan`, `withActionSpan`, `withLlmSpan`, `recordVoiceQualityTelemetry`), `AsyncLocalStorage` iz yayılımı ve opsiyonel OTLP HTTP dışa aktarıcısı | 2026-11-07 | Antigravity + alt ajan |
| T-11.2 | DONE | packages/core/src/langfuse.ts, packages/core/src/index.ts, packages/core/test/observability-quota-audit.test.ts | Opsiyonel Langfuse gözlemcisi (`createLangfuseObserver`), anahtar yokken sıfır ek yüklü devre dışı kip, gizli bilgi maskeleme (`scrubLangfusePayload`) | 2026-11-07 | Antigravity + alt ajan |
| T-11.3 | DONE | packages/core/src/{quota,usage}.ts, packages/ai/src/llm.ts, packages/db/src/schema/observability.ts, apps/api/src/routes/observability.ts, packages/core/test/observability-quota-audit.test.ts, apps/api/test/observability-http.test.ts | `recordUsage` ve `withUsageRecording` noktasına bağlı aylık kiracı jeton/maliyet kotası (`QuotaManager`, `QuotaExceededError` → HTTP 429 `"Bu ayki kullanım sınırınız doldu."`, %80 uyarı eşiği, diğer kiracılar etkilenmez) | 2026-11-07 | Antigravity + alt ajan |
| T-11.4 | DONE | packages/core/src/audit.ts, packages/db/src/schema/{observability,index}.ts, packages/db/src/isolation.ts, packages/db/src/migrations/core-schema.ts, apps/api/src/routes/observability.ts, apps/api/src/app.ts, apps/api/test/observability-http.test.ts | Değişmez (append-only RLS) `audit_logs` ve `tenant_quotas` tabloları (toplam 29 tablo), gizli bilgi süzmeli denetim kaydı servisi ve HTTP uçları | 2026-11-07 | Antigravity + alt ajan |
| T-11.5 | DONE | apps/{api,worker,voice-gateway,studio}/Dockerfile, apps/voice-gateway/src/{server,index}.ts, scripts/docker-entrypoint.sh, docker-compose.prod.yml, .env.example, packages/runtime/test/e2e-request-booking.test.ts, scripts/test/deployment-config.test.ts | 4 uygulama için Dockerfile, `docker-compose.prod.yml`, sağlık kontrolleri, Dokploy DNS yönlendirmeli ve çökmesiz idempotent giriş betiği, "Talep toplama + rezervasyon" (Web, WhatsApp, Telegram) uçtan uca simülasyon testleri | 2026-11-07 | Antigravity + alt ajan |

## T-0.1 — Düzeltme ve tamamlanma kaydı (2026-11-06, Codex)

Yeniden kontrolde önceki tamamlanma kaydı doğrulanamadı: `bun run lint`,
`turbo.json`, `tsconfig.base.json` ve `tsconfig.json` dosyalarının sonundaki fazla
boş satırlar nedeniyle exit 1 veriyordu. Bu üç dosya
`bun x biome format --write turbo.json tsconfig.base.json tsconfig.json` ile düzeltildi.

Düzeltme sonrası aşağıdaki komutların tümü exit 0 ile tamamlandı:

- `bun install`: bağımlılıklar doğrulandı; değişiklik gerekmedi.
- `bun run typecheck --force`: önbellek kullanılmadan 16/16 paket geçti.
- `bun run lint`: 69 dosya kontrol edildi; hata bulunmadı.
- `bun test`: iskelet testlerinde 16 başarılı, 0 başarısız.
- `docker compose --profile asterisk --profile voice config --quiet`: iki profil dahil yapılandırma geçerli. Servisler başlatılmadı.

Sonuç: T-0.1 kabul kriterleri sağlandı ve kart tamamlandı (DONE).
Bu kayıt `flowcore/docs/progress.md` ve `voiceai/docs/flowcore/progress.md` içinde eşitlendi.


## T-0.2 — CI komutları tamamlandı (2026-11-07, Codex)

Eklenen komutlar ve denetimler:

- `lint:domain-terms`: `apps/` ve `packages/` altındaki metin dosyalarını planın sektör terimi ifadesiyle, büyük/küçük harf ayrımı yapmadan tarar. Dosya ve satır numarası raporlar; bulgu varsa exit 1 verir. Belgeler, fixtures, bağımlılıklar, derleme çıktıları ve sembolik bağlantılar taranmaz. Eksik kaynak dizini hata sayılır.
- `lint:ui-terms`: TypeScript sözdizimi ağacını kullanarak JSX metinlerini, görünür metin özelliklerini ve doğrudan/koşullu metin ifadelerini denetler. Bileşen içindeki bu sabit metinleri sözlüğe taşımayı zorunlu kılar; `packages/ui/src/glossary.ts` metinlerinde yasaklı teknik terim ve kod adlarını arar. JSX kaynağı varsa sözlüğün eksik olması hatadır. Bu statik kontrol, çalışma anında dışarıdan gelen veya başka fonksiyonlardan çözümlenen metinlerin dil doğrulaması yerine geçmez.
- `db:migrate`: `packages/db/src/migrate.ts` mevcut olduğunda ayrı süreçte çalıştırır ve çıkış kodunu korur. Şema/geçiş betiği T-1.3 kapsamında olduğundan boş iskelette veritabanına bağlanmadan, geçiş uygulanmadığını açıkça bildirerek çıkar. Bu aşamadaki exit 0, gerçek veritabanı migrasyonu veya idempotentlik doğrulaması değildir.
- `typecheck`: mevcut 16 çalışma alanına ek olarak kök CI betiklerini ve testlerini de TypeScript kontrolüne alır. `lint` ve `test` komutları korunmuştur.

Doğrulama sonuçları:

- `bun run typecheck --force`: kök betikler ve önbelleksiz 16/16 paket geçti.
- `bun run lint`: 74 dosya, 0 hata.
- `bun run lint:domain-terms`: 64 kaynak dosyası, 0 bulgu.
- `bun run lint:ui-terms`: iskelette henüz JSX arayüz kaynağı yok; 0 bulgu. Hatalı JSX ve sözlük örneklerinin reddi testlerde doğrulandı.
- `bun test`: 25 başarılı, 0 başarısız. Dokuz yeni test; sektör terimleri, hariç tutulan dizinler, eksik kaynaklar, Türkçe/teknik metin ayrımı, JSX metinleri, sözlük zorunluluğu ve geçiş betiğinin hata kodunu koruma davranışını kapsar.
- `bun run db:migrate`: art arda iki çalıştırma da yukarıdaki açık atlama bildirimiyle exit 0.

T-0.2 kabul kriterleri sağlandı. Sıradaki kart T-1.1 (çekirdek veritabanı şeması).
Önceki T-0.1 düzeltme kaydı da dahil olmak üzere iki ilerleme kopyası ana FlowCore belgesine göre eşitlendi.


## T-1.1 — Çekirdek şema tamamlandı (2026-11-07, Codex)

- Drizzle ile 11 tablo tanımlandı: `tenants`, `workspaces`, `users`, `memberships`, `agents`, `channel_connections`, `contacts`, `contact_identities`, `contact_consents`, `conversations`, `messages`.
- Kiracı/çalışma alanı bütünlüğü için bileşik yabancı anahtarlar; rol, yön ve durum kontrolleri; kiracı içi kimlik tekilliği; konuşma başına pozitif/tekil mesaj sırası ve sağlayıcı mesaj kimliği tekilliği eklendi.
- Kullanıcılar genel kimlik olarak tutulur; kiracılara üyelik ve rol üzerinden bağlanır. RLS şemada tüm tablolarda etkin, izin veren politikalar eklenene kadar sıradan roller için erişim kapalıdır. Tam uygulama yetkilendirmesi ve kiracı bağlamı T-1.4 kapsamındadır.
- Bağlantı bilgileri için AES-256-GCM yardımcı modülü eklendi. Zarf kiracı/bağlantı kimliğine bağlanır; anahtar eksik veya geçersizse şifreleme fabrikası `null` döndürür. Veritabanı kısıtı açık bilgi nesnelerini, eksik/ek alanlı zarfları ve hatalı biçimleri reddeder. `.env.example` içindeki mevcut anahtarın biçim açıklaması düzeltildi; yeni zorunlu değişken yoktur.
- `drizzle-orm` 0.45.4 eklendi. Test bağımlılıkları `drizzle-kit` 0.31.11 ve PostgreSQL 17.5 içeren `@electric-sql/pglite` 0.3.15 olarak sabitlendi.
- Dokuz veritabanı ve beş şifreleme testi eklendi. SQL, doğrudan Drizzle şemasından üretilip geçici bellek veritabanında çalıştırıldı. Kiracılar/çalışma alanları arası hatalı bağlar, yinelenen kayıtlar, geçersiz durumlar, RLS erişim reddi ve şifreli veri değişiklikleri sınandı.

Doğrulama: `bun install --frozen-lockfile`, `bun run typecheck --force`, `bun run lint`, `bun run lint:domain-terms`, `bun run lint:ui-terms`, `bun test` komutlarının tümü exit 0. TypeScript 16/16 paket ve kök betikler; Biome 82 dosya; sektör taraması 72 dosya/0 bulgu; testler 39 başarılı/0 başarısız.

Docker servisi çalışmadığından konteyner testi yapılmadı. Kalıcı veritabanına migration/seed uygulanmadı. Dinamik varlıklar T-1.2, migration ve self-healing T-1.3, kimlik doğrulama ve izin veren RLS politikaları T-1.4 kapsamındadır; Faz 1'in toplu kabulü henüz tamamlanmadı.

Ayrıntılar: [Çekirdek veritabanı şeması](database-schema.md). Sıradaki kart: **T-1.2**.


## T-1.2 — Dinamik varlık modeli tamamlandı (2026-11-07, Codex + 3 alt ajan)

- Çalışma kullanıcının isteğiyle üç alt ajana ayrıldı: `dynamic_schema` şema uygulaması, `dynamic_tests` PostgreSQL entegrasyon testleri, `schema_review` salt okunur mimari inceleme. Ana ajan kapsamı belirledi, sonuçları birleştirdi, bütün repo doğrulamasını çalıştırdı ve belgeleri eşitledi.
- `entity_types`, `field_definitions`, `records` eklendi; toplam şema 14 tabloya çıktı. Kayıt türü anahtarı kiracı içinde, alan anahtarı kiracı/kayıt türü içinde tekildir. Teknik anahtar biçimi, özel nesne anahtarları ve boş etiket kontrolleri eklendi.
- Plandaki 12 alan türü, dört bayrak, hesaplama/doğrulama metadatası ve referans hedefi modellenmiştir. Alan sahibi, referans hedefi ve kayıt türü bileşik yabancı anahtarlarla aynı kiracıya bağlanır. Referans türünde hedef zorunlu, diğer türlerde boştur.
- Kayıt verisi/doğrulama JSON nesnesi, hesaplama ifadesi SQL NULL veya JSON nesnesi olmalıdır. Kayıt sürümü varsayılan 1 ve pozitiftir. `records.data` için GIN, kiracı/kayıt türü için B-tree indeksi eklendi. Üç yeni tabloda RLS varsayılan erişim reddi aktiftir.
- İncelemede yalnız sekme/satır sonundan oluşan etiketlerin kabul edildiği bulundu; iki etiket kontrolü POSIX boşluk sınıfıyla sıkılaştırıldı. Boşluk, sekme, satır sonu ve karışık boş karakter regresyonları testlere eklendi.
- 11 yeni entegrasyon testi; tüm alan türlerini, varsayılanları, metadata gidiş-dönüşünü, kiracı/anahtar tekilliğini, geçersiz tür/JSON/sürümü, hatalı kiracı/referans bağlantılarını, GIN indeksini ve iç içe JSON sorgusunu, üç tabloda RLS okuma/yazma reddini doğruladı. Eski toplam tablo beklentisi 11'den 14'e güncellendi.

Son doğrulama komutlarının tamamı exit 0:

- `bun install --frozen-lockfile`
- `bun run typecheck --force`: 16/16 paket ve kök betikler, önbelleksiz.
- `bun run lint`: 84 dosya, hata yok.
- `bun run lint:domain-terms`: 74 dosya, 0 bulgu.
- `bun run lint:ui-terms`: henüz JSX kaynağı yok, 0 bulgu.
- `bun test`: **50 başarılı, 0 başarısız; 221 doğrulama, 20 test dosyası**. SQL, Drizzle tanımlarından üretilip PGlite PostgreSQL 17.5 üzerinde çalıştırıldı.

`required/indexed/semantic/pii/computed_expr/validation` bu aşamada metadatadır; alan değerlerinin doğrulanması, hesaplama yürütme, üretilen alan indeksleri ve sürümle eşzamanlı güncelleme koruması henüz eklenmedi. Kalıcı migration/self-healing T-1.3 ve uygulama yetkilendirmesi T-1.4 kapsamındadır; Faz 1 toplu kabulü henüz tamamlanmadı. Yeni bağımlılık veya zorunlu ortam değişkeni eklenmedi.

Ayrıntılar: [Dinamik varlık modeli](dynamic-entities.md). Sıradaki kart: **T-1.3**.


## T-1.3 — Kalıcı migrasyon ve self-healing tamamlandı

2026-11-07; uygulama, test ve güvenlik incelemesi üç alt ajanla yürütüldü.
Drizzle kaynaklarından üretilen ve sürüm kontrolüne alınacak idempotent DDL,
tek bağlantıda transaction + advisory lock ile uygulanır. Eksik tablo, sütun,
FK/CHECK, indeks ve RLS onarılır. Beklenmeyen SQL hatası tüm işlemi geri alır.
İsteğe bağlı eklentiler savepoint ile değerlendirilir; eksik/yetkisiz durum
ayrı raporlanır. Arama yolu `pg_catalog, public` olarak sabitlendi; tablo ve
indeks hedefleri `public` ile nitelendi. Bağlantı ve kapatma hataları gizli
bilgi içermeyen mesajlarla ve başarısız çıkışla bildirilir.

`postgres`4.1.0 bağımlılığı eklendi; bağlantı varsayılanları ve Dokploy host
override desteklenir. Yeni zorunlu env yoktur. Eksik migration betiği artık
exit1 üretir. `db:generate`, `db:check`, `db:migrate`, `db:seed` hazırdır.
Örnek seed kullanıcı/parola oluşturmaz; düzenlenmiş isimleri değiştirmez.

Kanıt: `db:check`, önbelleksiz16/16paket+kök TypeScript, Biome91dosya,
sektör81dosya/0bulgu, arayüz0bulgu,59/59test(252assertion,21dosya) exit0.
Dokuz yeni test, kaynak-DDL katalog eşdeğerliği, tekrarlı kurulum, eksik nesne
onarımı, atomik geri alma, gerçekpg_trgm/vector ve seed tekrarını kapsar.
Yerel FlowCore `pgvector/pgvector:pg17` konteynerinde PostgreSQL17.11 ile
migration ve seed ikişer kez exit0;pg_trgm/vector etkin; tenants/workspaces/
agents/entity_types sayıları1'er. Voiceai servislerine müdahale edilmedi.

Ayrıntılar: [Migrasyon ve onarım](migrations.md). API başlangıç onarımı,
sağlık durumu ve Faz1 yetkilendirme kabulü sonraki kartlarda bağlanacak.


## T-1.4 ve T-1.5 — Kimlik, izolasyon ve çekirdek API tamamlandı

2026-11-07. Alt ajanlar oturum servisi, kiracı izolasyonu, kaynak API'si,
bağımsız testler ve güvenlik incelemesini yürüttü. Ana ajan Hono HTTP sınırını,
çerezleri, başlangıç onarımını, hata eşlemelerini, gerçek sunucu testini ve
belge senkronizasyonunu tamamladı.

- Argon2id parola özeti, atomik kayıt/organizasyon/üyelik, 256bit rastgele oturum,
  yalnız SHA256 özetinin saklanması, süre sonu ve çıkış eklendi. auth_sessions
  ile toplam15tablo mevcut; kaynakDDL güncellendi.
- NOLOGIN/NOBYPASSRLS uygulama rolü, DB'den türetilen üyelik/rol, FOR SHARE,
  SET LOCAL rol/tenant/user/membership_role ve katalog öncelikli arama yolu
  kullanılır. Permissive + restrictive politikalar geniş PUBLIC izinleriyle
  dahi kiracı sınırını korur. Parola/oturum tabloları uygulama rolüne kapalıdır.
- Kayıt/giriş/me/çıkış uçları güvenli çerez ve kaynak kontrolü kullanır; hamtoken
  yanıt JSON'una girmez. BozukJSON400 ve yetki401/403 sade destek kodlu hatalardır.
- Organizasyon ve altı veri kaynağında CRUD, katı şemalar, parametreliSQL,
  sayfalama, kayıt türü filtresi ve kayıt PATCH için atomik sürüm kontrolü eklendi.
  Eski sürüm409; ilişkili veride silme geri alınır; genericmembership/user CRUD yoktur.
- API başlangıçta gerçek onarımı dener; hazır olmadan503, başarısızlıkta15sn
  yeniden deneme; health gerçek SELECT1; /openapi.json çalışan19yolu tanımlar.
- İnceleme sırasında recursiveZodJSON şemasının OpenAPI stackoverflow sorunu
  bulundu: derinliği32ile sınırlı JSON kontrolü ve açıkOpenAPIobject tanımıyla
  düzeltildi. Nested özel nesne anahtarları reddedilir; geniş diziler çağrı
  argüman sınırına takılmadan dolaşılır.
- Test geliştirmede Bun1.3.13 toMatchObject asimetrik eşleştiricisinin gerçek
  yardımcıveriyi değiştirdiği izole edildi. Testyardımcısı ayrık status/id
  kontrollerine dönüştürüldü; üretimUUID doğrulaması gevşetilmedi.

Ana son bütün repo çalıştırması: db:check, önbelleksiz16/16paket+kök TypeScript,
Biome102dosya, domain92dosya/0bulgu, UI0bulgu ve95/95test(571assertion,25dosya)
exit0. Sonradan eklenen büyükJSON/derinlik/özelanahtar regresyonuyla kaynakHTTP
ajanı12/12test205assertion, TypeScript/Biome exit0 doğruladı.

Canlı sunucu localhost4000 + PostgreSQL17.11 üzerinde health/OpenAPI200,
ikikullanıcı kayıt/çerez, dinamik tür+kayıt oluşturma, PATCH başarı, eski
sürüm409, başka kiracı403, çıkışsonrası401 doğrulandı. Bu testin kullanıcı ve
verileri temizlendi. Önceki migrate2+seed2 kabulü gerçekPG'de geçti. Faz1'in
kartlara özgü kabulü sağlandı; sonraki fazların tümkanalrezervasyon ve ses
uçtanuca kapıları halen bekliyor.

Ayrıntılar: [Kimlik ve izolasyon](authentication.md), [Çekirdek API](api.md).


## T-2.1 — İfade ağacı ve doğrulayıcı tamamlandı (2026-11-07, GitHub Copilot)

- `packages/ir/src/expr/ast.ts` içinde planlanan ifade türleri ve işleçleri için
  katı, iç içe doğrulayıcı eklendi; paket girişinden tipler ve doğrulama API'si
  dışa aktarılıyor.
- Yol başvuruları 256 karakterle ve güvenli parça biçimiyle sınırlıdır; özel
  nesne anahtarları, erişimci özellikler, döngüler, geçersiz JSON değerleri,
  bilinmeyen özellikler ve işleçler reddedilir.
- Girdi sınırları: en çok 64 derinlik, 10.000 düğüm/değer, sabit metinlerde 120
  karakter. `matches-safe` yalnızca en çok 64 karakterli güvenli desen alt
  kümesini kabul eder; gruplama, alternatif, geri başvuru ve ileri/geri bakış
  desteklenmez. `*`/`+` tekrarları geri izleme yapmayan adımlı motorla yürütülür.
- Çağrı işlevlerinin argüman sayısı, mantık/liste alt öğeleri ve anlamsal eşleşme
  eşiği doğrulanır. Hatalı girdi `INVALID_EXPRESSION` kodlu `ExprValidationError`
  üretir; derin veya döngüsel girdiler yığın taşmasına yol açmaz.
- 16 ifade testi; tüm düğüm türlerini, sınırları, geçersiz girdileri ve
  erişimci/döngü güvenliğini kapsar. T-2.1 yalnızca veri sözleşmesi ve
  doğrulayıcıdır; ifade çalıştırma T-2.2, Türkçe ayrıştırma/anlatım T-2.3'tür.

Doğrulama: `bun run typecheck --force` (16/16 paket), `bun run lint` (104 dosya),
`bun run lint:domain-terms` (94 dosya/0 bulgu), `bun run lint:ui-terms` (0 kaynak)
ve `bun test` (112 başarılı, 0 başarısız; 1231 assertion) exit 0.


## Devam denetimi — T-2.1 mevcut çalışması korundu

2026-11-07. Copilot tarafından eklenmiş T-2.1 dosyaları ve kararları mevcut
kaynak olarak kabul edilip yeniden doğrulandı: önbelleksiz16/16typecheck,
Biome104dosya,domain94dosya/0bulgu,UI0bulgu,112/112test1231assertion exit0.
Mevcut AST şekli korunarak T-2.2 yorumlayıcısına geçildi.

Faz1 manuel kanıtı ayrıca `scripts/verify-phase1.ts` / `bun run verify:phase1`
ile tekrar üretilebilir hale getirildi. İzole geçici veritabanı + gerçek HTTP
kullanan komut PostgreSQL17.11 üzerinde exit0 verdi; geçici kaynaklar temizlendi.
Kök TypeScript kontrolü de exit0. Ayrıntı [Faz1 kabulü](phase1-acceptance.md).


## T-2.2 — Başvuru yorumlayıcısı tamamlandı (2026-11-07, GitHub Copilot + önceki ajanlar)

- `evaluate(ast, ctx)` tüm AST düğümlerini işler. Başvurular yalnız kendi veri
  özelliklerini okur; prototip/getter çalıştırılmaz. Liste koşullarındaki `item.*`
  yalnız o listenin geçerli öğesine bağlanır; iç içe listeler dış kapsamı korur.
- Türkçe locale duyarlı metin karşılaştırması, eski boolean adları (`evet/true/1`
  vb.), ondalık virgül, kapsayıcı ve yönü ters verilebilen `between`, dizi veya
  ayraçlı metin üzerinden `in`, yapısal JSON eşitliği ve kısa devre mantığı
  uygulanır. Eksik/uyumsuz değerler karşılaştırmada eşleşme oluşturmaz.
- `now` tek değerlendirme içinde sabitlenir; amaç ve anlamsal eşleşme yalnızca
  verilen senkron konak bağlamı/kancaları üzerinden çalışır. Kanca hataları sade
  `INVALID_CONTEXT` hatasına çevrilir; async kancalar ve geçersiz sonuçlar reddedilir.
- Kaynak tüketimi ortak bütçelerle sınırlandırılır: 100.000 ifade ziyareti,
  10.000 liste öğesi, 16.384 karakterlik girdi metni, 1.000.000 değer işi ve
  2.000.000 güvenli desen adımı. Dizi ve nesne anahtarı taramaları da bu bütçelere
  dahildir; seyrek/accessor diziler reddedilir.
- Güvenli desen motoru grup/alternatif/geri başvuru/lookaround içermeyen sınırlı
  grameri geri izleme yapmadan yürütür. 16.384 karakter girdi sınırı ve tüm
  değerlendirmede paylaşılan adım bütçesi vardır.
- Regresyonlar tekrar eden uzun metin işini, seyrek/büyük dizileri, nesne anahtarı
  taramasını, async kanca retlerini ve düzenli ifade geri izleme riskini kapsar.

Doğrulama: `bun run typecheck --force` (16/16 paket), `bun run lint` (114 dosya),
`bun run lint:domain-terms` (103 dosya/0 bulgu), `bun run lint:ui-terms` (0 kaynak),
`bun test` (149 başarılı, 0 başarısız; 1860 assertion) ve `bun run verify:phase1`
(geçici PostgreSQL + gerçek HTTP; temizleme başarılı) exit 0.


## T-2.3 — Türkçe ifade ayrıştırıcı ve anlatıcı tamamlandı (2026-11-07, GitHub Copilot + önceki ajanlar)

- `parseTr(text, options?)` Türkçe koşul metnini doğrulanmış Expr ağacına;
  `describeTr(expr, options?)` ağacı etiket tabanlı Türkçe cümleye dönüştürür.
- Sistem ve özel etiketler normalize edilir; çakışan/tehlikeli etiketler,
  bilinmeyen başvurular ve ham teknik yollar reddedilir. Mantık önceliği,
  parantezler, karşılaştırmalar, metin koşulları, fonksiyonlar, liste işlemleri,
  amaç/anlamsal eşleşme ve JSON sabitleri round-trip testlidir.
- Kaynak metni 32.768 karakter ve 16.384 belirteçle sınırlıdır; derin ağaçlar
  AST doğrulayıcısının sınırında reddedilir. Hatalar sade `ExprTextError` ve
  `INVALID_EXPRESSION_TEXT` koduyla sunulur; ham iç başvurular anlatılmaz.
- Parser/anlatıcı, seçenek türleri ve sınır sabitleri `@flowcore/ir` paket
  girişinden dışa aktarılır; paket girişinde public API smoke testi eklidir.

Doğrulama: `bun run typecheck --force` (16/16 paket), `bun run lint` (114 dosya),
`bun run lint:domain-terms` (103 dosya/0 bulgu), `bun run lint:ui-terms` (0 kaynak)
ve `bun test` (150 başarılı, 0 başarısız; 1861 assertion) exit 0.


## T-2.4 — Sistem değişkenleri ve bağlam kurucusu tamamlandı (2026-11-07, GitHub Copilot + önceki ajanlar)

- `buildSystemContext` önceden yetkilendirilmiş girdiden değişmez sistem
  bağlamı kurar; kiracı verisi getirmez veya yetkilendirme yapmaz. Zaman dilimi,
  anlık saat, kişi bilgileri, kanal, arama ölçüleri ve işletme saatlerini
  yorumlayıcı başvuruları için `values` altında sunar.
- Saat ve hafta günü tenant tarafından verilen saat diliminde hesaplanır; çalışma
  aralıklarında bitiş saati hariçtir, gece aşımı desteklenir ve günlük istisna
  o gün için haftalık/önceki geceden devreden saatleri geçersiz kılar.
- İletişim öznitelikleri güvenli JSON olarak kopyalanıp derin dondurulur; getter,
  prototipli nesne, döngü, seyrek dizi, geçersiz kanal/tarih/saat dilimi ve aşırı
  boyut/derinlik sade `ContextError` ile reddedilir.
- Kanal ve sistem değişkeni tanımları, sınır sabitleri, bağlam kurucusu ve ilgili
  tipler `@flowcore/ir` girişinden dışa aktarılır. Testler UTC dışı saat dilimi,
  DST, gece aralığı, istisna önceliği, varsayılanlar ve sınırları kapsar.

Doğrulama: `bun run typecheck --force` (16/16 paket), `bun run lint` (115 dosya),
`bun run lint:domain-terms` (104 dosya/0 bulgu), `bun run lint:ui-terms` (0 kaynak)
ve `bun test` (159 başarılı, 0 başarısız; 1963 assertion) exit 0.


## Faz 3 (T-3.1 – T-3.10) — Derleyici / Codegen ve Değişmez Yayın Hattı tamamlandı (2026-11-07, Antigravity + 3 alt ajan)

- **T-2.5 ve T-3.1 (IR ve Akış Doğrulama)**: `packages/ir/test/expr-compat.test.ts` ile akış koşul operatörleri ve Türkçe round-trip uyumluluk testleri eklendi. `packages/compiler/src/ir.ts` ve `packages/compiler/src/validate.ts` içinde `FieldIR`, `EntityTypeIR`, `ActionIR`, `FlowIR` tanımları, kanonik JSON üzerinden deterministik SHA-256 özeti (`hashIR`), erişilemeyen adım (`UNREACHABLE_STEP`), sonsuz döngü (`INFINITE_LOOP`), kopuk çıkış (`UNCONNECTED_OUTPUT`) ve eksik koşul dalı (`MISSING_CONDITION_BRANCHES`) doğrulayıcıları tamamlandı.
- **T-3.2, T-3.3, T-3.4 (İfade ve Şema Derleme Hedefleri)**:
  - `packages/compiler/src/targets/js.ts`: `Expr` AST'sini saf JavaScript fonksiyonuna derler; tüm sabitler üretilen koda gömülmeden `__l[idx]` bağlam dizisi üzerinden okunur (kod enjeksiyonuna karşı tam koruma) ve LRU önbellekte tutulur. **10.000 rastgele AST fuzz testinde** `evaluate(ast, ctx)` ile derlenmiş fonksiyon %100 aynı sonucu üretti (~`809 ms`). **1.000.000 değerlendirme benchmarkı** ~`613.85 ms` (~`1.63M değerlendirme/sn`) sürede tamamlandı.
  - `packages/compiler/src/targets/sql.ts`: `Expr` AST'sini parametreli PostgreSQL `WHERE` cümlesine (`$1..$n`) derler; JSONB yollarını ve `columnMap` indeksli sütun yönlendirmesini güvenli biçimde uygular; çalışma zamanı düğümlerini (`intent`, `semanticMatch`) ve tehlikeli anahtarları reddeder.
  - `packages/compiler/src/targets/schema.ts`: 12 alan türü için çalışma zamanı Zod şeması (`buildFieldZodSchema`, `buildEntityZodSchema`), deterministik JSON Schema (Draft 2020-12) ve TypeScript kaynak kodu üretir.
- **T-3.5, T-3.6, T-3.7 (Araç Şemaları, Durum Makinesi ve Sistem Yönergesi)**:
  - `packages/compiler/src/targets/tools.ts`: `ActionIR` tanımlarından Gemini (`functionDeclarations`), OpenAI (`function`), Anthropic (`input_schema`) ve MCP (`inputSchema`) araç şemalarını deterministik sıra ve SHA-256 özetiyle üretir.
  - `packages/compiler/src/targets/state-machine.ts`: `FlowIR` tanımını yan etkisiz durum makinesi modülüne (`CompiledStateMachine`) derler; `Condition`, `IntentRouter`, öncelik sıralı koşullu geçişler ve `Goto` zincirlerini deterministik olarak yürütür.
  - `packages/compiler/src/targets/prompt.ts`: Adım bazlı, belirteç bütçeli (`maxTokensPerStep`, `maxTotalTokens`) Türkçe sistem yönergesi parçaları üretir; dallanma koşullarını `describeTr` ile ham değişken adı sızdırmadan açıklar ve bütçe aşımında monotonik kırpma uygular.
- **T-3.8 ve T-3.9 (DDL, Typed SDK, OpenAPI 3.1 ve CLI)**:
  - `packages/compiler/src/targets/ddl.ts`: İndeksli alanlar için PostgreSQL 17 uyumlu `GENERATED ALWAYS AS ... STORED` sütunları ve B-Tree/GIN indeksleri ile `physicalTable: true` varlıklar için fiziksel tablo DDL'i üretir; dry-run diff (`diffEntityDdl`) ve `applyEntityDdl` PGlite (PostgreSQL 17.5) üzerinde arka arkaya iki kez idempotent olarak doğrulandı.
  - `packages/compiler/src/targets/sdk.ts` ve `scripts/flowcore.ts`: `types.ts`, `client.ts` ve `openapi.json` (OpenAPI 3.1.0) üretir; `bun run flowcore codegen pull --tenant <id>` CLI komutuyla `packages/sdk-generated/src` altına yazar.
- **T-3.10 (Değişmez Yayın Hattı, Sürüm Sabitleme ve Geri Alma)**:
  - `packages/db/src/schema/flows.ts` ile `flows`, `flow_versions` ve `artifacts` tabloları eklendi (toplam çekirdek şema **18 tablo**). `packages/db/src/isolation.ts` içinde `flow_versions` ve `artifacts` tablolarına uygulama rolünde yalnızca `SELECT, INSERT` izni verilerek yayınlanmış sürümlerin ve derleme çıktılarının değiştirilemezliği (immutability) veritabanı seviyesinde zorunlu kılındı (`42501` yetki reddi).
  - `packages/compiler/src/pipeline.ts` ve `apps/api/src/routes/flows.ts` ile taslak → derle → doğrula → simülasyon → yayınla → geri al (rollback) hattı ve çalışan konuşma oturumlarının başladıkları `flow_version_id` üzerinde tamamlanması (`startPinnedFlowSession`, `stepPinnedFlowSession`) uçtan uca doğrulandı.

Son doğrulama komutlarının tamamı exit 0:

- `bun run typecheck --force`: 16/16 paket ve kök betikler, önbelleksiz.
- `bun run lint`: 137 dosya, 0 hata.
- `bun run lint:domain-terms`: 125 dosya, 0 bulgu.
- `bun run lint:ui-terms`: 0 bulgu.
- `bun run db:check`: Drizzle şeması ve `core-schema.ts` tam uyumlu.
- `bun run db:migrate` (2x) ve `bun run db:seed` (2x): gerçek PostgreSQL 17 üzerinde ikişer kez `exit 0`.
- `bun test`: **193 başarılı, 0 başarısız; 12.397 assertion, 39 test dosyası** (`golden.test.ts`, `flows-http.test.ts`, PGlite SQL WHERE eşdeğerlik testi ve `expr-compat.test.ts` dahil).

Sıradaki faz: **Faz 4 — Çalışma Zamanı (T-4.1 – T-4.5)**.


## Faz 4 — Çalışma zamanı tamamlandı (2026-11-07, Codex + 3 alt ajan)

Kullanıcının faz sonuna kadar devam talimatıyla T-4.1–T-4.4 birlikte bitirildi.
Devralırken Faz 2/3 zaten tamamlanmıştı; mevcut 193 test yeniden doğrulandı
ve bu çalışma Faz 4'e ayrıldı. Faz 5 başlatılmadı.

- Derlenmiş makine motoru; olay tekilleştirme, özgün sonuç tekrarı, revizyon,
  tamamlanmış işlem anahtarları, güvenli snapshot ve sürüm sabitleme eklendi.
- Planın tüm adım türleri; bilgi yeniden sorma, amaç/koşul yönlendirme, işlem,
  alt akış, döngü, paralel dallar, model/aktarım kancaları, bekleme ve onay
  davranışlarıyla uygulandı. Dış sağlayıcı bağlantıları sonraki fazlara aittir.
- PostgreSQL `flow_sessions` checkpoint'i ve doğrulanan isteğe bağlı Redis
  önbelleği eklendi. Şema 19 tabloya çıktı. Oturum kilidi, CAS revizyonu,
  tenant RLS ve aynı transaction'ı alan işlem fabrikası birlikte çalışıyor.
- DBOS 5.4.0 worker; zamanlayıcı, olay, insan onayı ve uzun işlemleri ses
  turundan ayrı yürütüyor. `apps/worker` içinde `bun run start` hazır;
  başarısız başlangıçta güvenli yeniden deneme ve sinyalle temiz kapanış var.
- İncelemede bulunan eski olayın revizyonu geriye yazması, tamamlanan oturumun
  yeniden değişmesi, kilit içindeki ikinci bağlantının havuzu tüketmesi,
  paralel dalın hata sonrasında çalışmaya devam etmesi ve bekleme son tarihinin
  yeniden başlatmada uzaması düzeltildi. Her biri regresyon testleriyle kapsandı.
- DBOS bağlantı açılışındaki beklenmeyen sorgunun `pg` uyarısı, aynı güvenlik
  sınırı PostgreSQL başlangıç seçeneğine taşınarak giderildi; uyarı susturulmadı.

Son doğrulama sonuçlarının tümü exit 0:

- Önbellek kullanılmadan `bun run typecheck --force`: kök + 16/16 paket.
- `bun run lint`: 155 dosya; `lint:domain-terms`: 139 dosya/0 bulgu;
  `lint:ui-terms`: 0 bulgu; `db:check`: kaynak ve üretilen DDL uyumlu.
- `bun test`: **236 başarılı, 0 başarısız; 12.638 assertion, 45 dosya**.
  Derleyicinin 10.000 AST eşdeğerlik testi ve 1 milyon değerlendirme ölçümü de
  bu çalıştırmada yeniden geçti.
- Gerçek PostgreSQL 17.11 üzerinde `db:migrate` 2x + `db:seed` 2x ve
  `verify:phase1` geçti; önceki fazın HTTP/izolasyon davranışları korundu.
- `bun run verify:phase4 --redis-url redis://127.0.0.1:6389`: gerçek Redis,
  13 oturum, 12 eşzamanlı oturum, eski olay, kiracı sınırı, sürüm sabitleme,
  süreçten bağımsız yükleme ve motor → DBOS köprüsü geçti; uyarı yok.
- Aynı kabul komutu gerçek `SIGKILL` kurtarmasını da çalıştırdı: 5 iş başarıyla
  tamamlandı, yarım kalan işlem 2 kez denendi ve tek kalıcı etki oluştu;
  son ölçüm **2240 ms**. Geçici veritabanları ve alt süreçler temizlendi.

Uzak servis etkilerinin tekilleşmesi, sağlayıcının verilen sabit işlem
anahtarını uygulamasını gerektirir. Bu sınır ve çalışma sözleşmeleri
[çalışma zamanı belgesinde](runtime.md) açıklanmıştır. Kanıt ve kararlar iki
belge konumunda eşitlendi. Sıradaki faz **Faz 5 — İşlem Kataloğu**.


## Faz 5 (T-5.1 – T-5.3) — İşlem Kataloğu ve SSRF Korumalı Entegrasyonlar tamamlandı (2026-11-07, Antigravity + 3 alt ajan)

- **Gizli Bilgi Kasası (`packages/core/src/secrets.ts`, D-12)**:
  - AES-256-GCM tabanlı `sealSecret`, `openSecret` ve `createSecretVault` eklendi. Sabit (hardcoded) varsayılan anahtar kesinlikle kullanılmaz; güvenlik anahtarı tanımlı değilse `"Bağlantı bilgilerini kaydetmek için güvenlik anahtarı tanımlanmalı"` hatası döner. Organizasyon kimliği (`tenantId`) ve kapsam (`scopeId`) AAD (Additional Authenticated Data) içine bağlanarak kiracılar arası şifreli veri taşınması engellenir.
- **T-5.1 — İşlem Kayıt Defteri (`packages/actions/src/define.ts`, `packages/actions/src/registry.ts`)**:
  - `defineAction({ id, labelKey, inputSchema, outputSchema, capabilities, execute })` girdi/çıktı Zod şemalarını ve organizasyon bağlamını doğrular.
  - `createActionRegistry` ve `createDefaultActionRegistry` 30 yerleşik işlemi kaydeder (`@flowcore/compiler` içindeki `BUILTIN_ACTION_IDS` listesiyle 30/30 birebir eşleşir), `idempotencyKey` bazlı tekilleştirme uygular ve `createRuntimeHook` ile `@flowcore/runtime` `FlowEngine` (`EngineHooks.executeAction`) döngüsüne doğrudan bağlanır.
- **T-5.2 — 30 Yerleşik İşlem ve SSRF Koruması (`packages/actions/src/ssrf.ts`, `packages/actions/src/builtins/**`)**:
  - **Veri, Değişken, Kişi, İzin ve Rezervasyon (`data-and-booking.ts`)**: `record.create`, `record.update`, `record.query` (`@flowcore/ir` `Expr` filtrelemeli), `record.delete`, `record.upsert`, `var.set`, `var.compute`, `contact.tag`, `contact.score`, `consent.update`, `booking.findSlots`, `booking.reserve` (çakışan zaman dilimi/double-booking engellemeli) ve `booking.cancel` hem PGlite/PostgreSQL `SqlExecutor` hem de bellek durumu (`ActionMemoryState`) üzerinde çalışacak şekilde tamamlandı.
  - **İletişim, Yönlendirme ve Yapay Zeka (`comm-and-ai.ts`)**: `message.send` (metin, buton, liste, medya), `message.template`, `notify.sms`, `notify.email`, `handoff.human`, `call.transfer`, `channel.switch`, `ai.kbSearch`, `ai.extract`, `ai.classify`, `ai.generate` ve `ai.summarize` şablon çözümleme ve adaptör/outbox desteğiyle uygulandı.
  - **SSRF Koruması ve Dış Entegrasyonlar (`ssrf.ts`, `integrations.ts`)**: `validateSafeOutboundUrl` ile `127.0.0.0/8` (`127.0.0.1`), `169.254.0.0/16` (`169.254.169.254` bulut metadata), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10`, `localhost`, `*.local`, `*.internal`, IPv6 loopback (`::1`), IPv4-mapped IPv6 (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`), sayısal/sekizlik/onaltılık IP gösterimleri, DNS rebinding ve `301/302/303/307/308` yönlendirme hedefleri (`allowHosts` içinde verilse bile) kesin olarak engellendi. `http.request` (`{{secret:NAME}}` çözümleme, `AbortController` zaman aşımı, `5xx`/`429` yeniden deneme), `webhook.out` (HMAC-SHA256 imzalı), `mcp.call`, `n8n.trigger` ve `payment.link` tamamlandı.
- **T-5.3 — Kullanıcı Tanımlı İşlem Şablonları / Makrolar (`packages/actions/src/macros.ts`)**:
  - `defineActionMacro`, `registerActionMacro`, `macroToActionIR` ve `compileMacrosToTools` ile kullanıcı tanımlı parametre şemaları dinamik Zod doğrulayıcısına çevrilir, alt adımlar `{{param.*}}`, `{{step.*}}` ve `{{field.*}}` bağlamlarıyla sırayla yürütülür ve `@flowcore/compiler` üzerinden Gemini, OpenAI, Anthropic ve MCP araç şemalarına derlenir (`T-5.4 code.run` planda Faz 9 sonrası opsiyonel olarak işaretlidir).

Son doğrulama sonuçlarının tümü exit 0:

- `bun run typecheck --force`: 16/16 paket ve kök betikler, 0 hata.
- `bun run lint`: 167 dosya kontrol edildi, 0 hata.
- `bun run lint:domain-terms`: 151 dosya kontrol edildi, 0 bulgu.
- `bun run lint:ui-terms`: 0 bulgu.
- `bun run db:check` ve `bun run db:migrate` (2x): 0 hata.
- `bun test`: **250 başarılı, 0 başarısız; 12.789 assertion, 49 dosya**.

Sıradaki faz: **Faz 6 — Bilgi Bankası (T-6.1 – T-6.4)**.


## Faz 5 — Kabul betiği ve denetim tablosu tamamlandı (2026-11-07)

- `scripts/verify-phase5.ts` ve `bun run verify:phase5` eklendi: 30 yerleşik işlemin derleyici listesiyle birebir eşleşmesini, `127.0.0.1`, `169.254.169.254`, `localhost`, `::1` ve özel ağ adreslerinin reddini ve işlem/çekirdek testlerini tek komutta doğrular.
- `docs/execution-audit.md` güncellendi: T-5.1 – T-5.3 tamamlandı, T-5.4 opsiyonel/ertelendi, Faz 5 kabul edildi.
- Doğrulama: `bun run verify:phase5` exit 0 (30 işlem, 5 engellenen adres).


## Plan genişletmesi (2026-11-07, kullanıcı talebi)

Plana dört kart eklendi: **T-1.6** (kanal bağlantısı, konuşma/mesaj okuma ve üyelik/davet API'si), **T-7.6** (Gelen Kutusu API'si), **T-9.6** (kişi verisi dışa aktarma ve silme), **T-10.13** (ilgili Studio ekranları). Faz 10 bağımlılık satırı bu kartlara bağlandı. Token kotası (T-11.3) sonda kalır; Faz 6 ve 9 kartlarına `recordUsage` kancası notu eklendi. Dört kart `TODO`; T-1.6 eklendiği için Faz 1 kabulü yeniden açıldı. Kod değişikliği yapılmadı. Karar: D-27 (çakışan D-23 numarası sonradan düzeltildi).


## Faz 6 — Bilgi tabanı eksiksiz tamamlandı (2026-11-07, Codex + 3 alt ajan)

Kullanıcının Faz 6 talimatıyla T-6.1–T-6.7 bitirildi. Devralınan Faz 5
uygulaması korundu; başlangıçta 250/250 test yeniden geçti. Faz 7'ye geçilmedi.

- Kaynak projedeki bölümleme, içerik özeti, önbellek, çıkarım, depo ve arama
  davranışları sektör terimlerinden bağımsız yeni pakete uyarlandı.
- Koleksiyon, belge, bölüm, koşullu bağlam ve SSS önerisi için beş tenant/RLS
  tablosu eklendi. Şema 24 tablo; kaynak migrasyon ve başlangıç onarımı güncel.
- Kiracı/genel, asistan ve kanal kapsamı; gerçek PostgreSQL pgvector + Türkçe
  FTS, RRF ve isteğe bağlı sınırlı reranker uygulandı. Sağlayıcı/eklenti yokken
  metin araması çalışır; sahte anlamsal vektör üretilmez.
- Mevcut opsiyonel Gemini anahtarını kullanan model adaptörü, model/boyut
  metadatası, kiracı/model/görev ayrımlı LRU ve DBOS yeniden güncellemesi eklendi.
  API kuyruğa yazar; worker uzun işi yürütür. Yeni zorunlu ortam değişkeni yok.
- Dosya (PDF/DOCX/TXT/MD/CSV), güvenli URL ve Soru-Cevap kaynakları; gerçek
  dosya ayrıştırıcıları ve boyut/süre/genişleme sınırlarıyla bağlandı.
- Kayıt türü + Expr tetik/filtre üzerinden izinli alanlar sınırlı prompt'a
  eklenir. İşlem kataloğunun `ai.kbSearch` adaptörü ve birleşik prompt servisi hazır.
- Konuşma soru/yanıtlarından maskelenmiş, tekrarsız SSS önerileri oluşturulur;
  yalnız açık onayla kaynak yayımlanır. Onay tekrarında ikinci belge oluşmaz.
- Koleksiyon/belge yönetimi, dosya yükleme, arama, yeniden güncelleme, bağlam
  ve SSS uçları mevcut oturum/rol sistemi ve OpenAPI'ye bağlandı.

İncelemede bulunan ve düzeltilenler:

- Eski model işinin aynı içerik revizyonunda yeni işi ezmesi: ayrı `indexToken`
  ile durum ve bölüm yazımı korunuyor; eski iş başarı/başarısızlık durumunu bile ezemiyor.
- Worker kurtarmasının özel işleyici kurulmadan başlaması: işleyici DBOS
  açılışından önce kaydediliyor; gerçek yeniden başlatma testiyle doğrulandı.
- DNS denetiminden sonra ikinci çözüm/rebinding riski: doğrulanan adres gerçek
  bağlantıya sabitlendi; Node/Bun `lookup({all:true})` farkı testle giderildi.
- Yanıt vermeyen reranker'ın aramayı bekletmesi: sınırlı süre, iptal işareti ve
  yetkili FTS sonuçlarına dönüş eklendi.
- Koleksiyon süzmesinin birleşik prompt'un dinamik bölümünü kapsamaması:
  `collectionId` koşullu bağlamda da uygulanıyor.
- Geçersiz opsiyonel sağlayıcı ayarının başlangıcı kesmesi: yapılandırma
  fabrikası güvenli biçimde sağlayıcısız/metin araması moduna döner.

Son doğrulama komutları exit 0:

- `bun install --frozen-lockfile`: 183 paket, bağımlılık değişimi yok.
- `bun run typecheck --force`: kök betikler ve 16/16 paket önbelleksiz geçti.
- `bun run lint`: 197 dosya; `lint:domain-terms`: 176 dosya/0 bulgu;
  `lint:ui-terms`: 0 bulgu; `db:check`: Drizzle ve üretilen DDL eşit.
- `bun test`: **285 başarılı, 0 başarısız; 13.047 assertion, 56 dosya**.
- Gerçek PostgreSQL 17.11 üzerinde `db:migrate` 2x ve `db:seed` 2x geçti.
  `docker compose config --quiet` geçerli.
- `bun run verify:phase6`: gerçek HTTP + pgvector/FTS + DBOS kuyruğu, model
  metadatası, eski içerik/model işi reddi, tenant RLS, asistan kapsamı, koşullu
  kayıt prompt'u, SSS onayı ve işlem adaptörü geçti.
- Aynı komut yeni worker'ı güncelleme ortasında gerçek `SIGKILL` ile kapatıp
  yeniden başlattı: **2 model denemesi, 1 son bölüm, 1384 ms kurtarma**.
  Geçici süreçler ve veritabanları temizlendi.
- `verify:phase1`, `verify:phase4`, `verify:phase5` tekrar geçti; önceki HTTP,
  oturum, DBOS kurtarması ve 30 işlem/SSRF davranışları korundu.

Kabulde deterministik sağlayıcı kullanıldı; gerçek Gemini REST biçimi ayrı
protokol testinde doğrulandı. Ücretli sağlayıcının canlı kalite/gecikme ölçümü
bu yerel kabulün kanıtı değildir. Ayrıntılar, sınırlar ve kullanım sözleşmeleri
[bilgi tabanı belgesinde](knowledge.md). Belgeler iki konumda eşitlendi.


## T-1.6 — Atlanan kanal, konuşma ve üyelik API'si tamamlandı (2026-11-07)

Kartın plan metninde bulunup uygulamada eksik olduğu doğrulandı; kullanıcı
isteğiyle üç alt ajanla tamamlandı. Planın diğer yeni kartları korunmuştur.

- Kanal bağlantısı oluşturma/listeleme/okuma/düzenleme/silme; AES-256-GCM
  yalnız yazılan kimlik bilgileri, `hasCredentials` ve güvenlik anahtarı
  kullanılabilirliği göstergeleri eklendi. Kimlik bilgisi ve şifreli zarf hiçbir
  genel yanıtta seçilmiyor. Açık config izin listesi eski gizli alanları da süzer.
- Anahtar yokken kimlik bilgisi yazma 503; okuma/açık ayarlar/temizleme çalışır.
  Bağlantı durumlarına geriye uyumlu `error` eklendi; durum etiketleri Türkçe.
- Konuşma ve mesaj salt okunur liste/detay uçları; kanal/durum/kişi/tarih ve
  ek süzgeçler, kaynak+tenant+süzgece bağlı imleçler eklendi. PostgreSQL'in
  mikrosaniyeleri korunur; mesajlar konuşma içinde `sequence` sırasındadır.
- Üyelik listeleme, rol değiştirme, kaldırma; süreli/tek kullanımlık/e-posta
  bağlı davet oluşturma, listeleme, iptal ve kabul eklendi. DB yalnız özeti
  saklar; paylaşılacak davet anahtarı oluşturana yalnız bir kez döner.
- Son sahip hem silmede hem rol düşürmede korunur. Yalnız sahip başka sahip
  atayabilir; yönetici sahip üzerinde yetki kazanamaz. Tenant kilidi, aktör
  satır kilidinden önce alınır; iki sahibin eşzamanlı rol düşürmesi sıfır sahip
  veya kilit döngüsü oluşturmaz. Eski davet mevcut üyeliğin rolünü değiştirmez.
- Yeni tenant/RLS `membership_invitations` tablosuyla güncel şema 25 tablo;
  idempotent migrasyon, başlangıç onarımı ve konuşma zaman indeksi güncellendi.
- Tüm uçlar gerçek Hono uygulaması/OpenAPI'ye bağlandı. Kullanıcı RLS'si
  genişletilmedi; üye dizini yalnız yetkisi doğrulanmış yönetimde sabit alanları okur.

Doğrulama sonuçları exit 0:

- `bun test`: **302 başarılı, 0 başarısız; 13.281 assertion, 60 dosya**.
  T-1.6'ya ait 17 yeni test; şifreli saklama/yanıtta sızıntı yokluğu, eksik
  anahtar, eski config süzmesi, rol ve tenant sınırı, imleç/mikrosaniye/tarih,
  davet yarışı/tekrar/süre/iptal/e-posta ve son sahip korumasını kapsar.
- `bun run typecheck --force`: kök ve 16/16 paket önbelleksiz geçti.
- `bun run lint`: 207 dosya; `lint:domain-terms`: 185 dosya/0 bulgu;
  `lint:ui-terms`: 0 bulgu; `db:check`: kaynak ve DDL uyumlu.
- Gerçek PostgreSQL 17.11'de `db:migrate` 2x + `db:seed` 2x geçti.
- `bun run verify:t1.6`: yeni geçici DB ve gerçek HTTP ile kimlik bilgisi
  sızıntısı yokluğu, tenant RLS, mikrosaniyeli konuşma imleci, sıralı mesajlar,
  eşzamanlı tek davet kabulü, süreli/tek kullanımlık davet ve iki gerçek
  sahibin eşzamanlı rol düşürmesi geçti; tek sahip korundu.
- `verify:phase1` ve güncel 25 tabloluk `verify:phase6` yeniden geçti;
  önceki API/bilgi tabanı/DBOS kurtarması korunuyor. Geçici kaynaklar temizlendi.

T-1.6 **DONE**, Faz 1'in yeniden açılan kart kabulü kapatıldı. Yol ve güvenlik
sözleşmeleri [kanal/konuşma/üyelik belgesindedir](tenant-management.md).
Davet e-postası gönderilmez; paylaşılabilir anahtar yalnız oluşturma yanıtında
verilir. Yeni zorunlu ortam değişkeni veya dağıtım işlemi yoktur.


## Faz 7 — Mesaj kanalları tamamlandı (2026-11-07, Claude + alt ajanlar)

- **Sözleşme ve adaptörler:** ortak `ChannelAdapter` sözleşmesi; WhatsApp (3 sağlayıcı), Telegram ve web sohbet. Gizli bilgiler günlüklere ve yanıtlara yazılmaz; dış adresler SSRF korumasından geçer.
- **Çalışan:** vazgeçme algılama ve izin geri alma, yapay zekâ duraklatma/devir, süreli kiralamalı konuşma kilidi, araç döngüsü sınırı (8), gönderim öncesi kalıcı işaret; belirsiz gönderim yeniden denenmez.
- **Uçlar:** `/api/webhooks/channels/{kiracı}/{bağlantı}` (imza, yineleme, kiracı gizliliği), `/api/web-chat/...` (oturum, mesaj, olay akışı), `/api/tenants/{kiracı}/inbox/...` (Gelen Kutusu). Bkz. [Kanallar](channels.md).
- **Kota kancası:** `recordUsage` (`@flowcore/core`) eklendi; gömme ve yanıt üretimi bu noktadan geçer. T-11.3 kotası sonradan buna bağlanır.
- **Düzeltmeler:** bilgi tabanı gömme çağrılarına kullanım kaydı bağlandı; kanal bağlantısı API'si `allowedOrigins` kabul eder ve web sohbet bağlantısına ziyaretçi anahtarını otomatik üretir.

Doğrulama (hepsi exit 0): `bun run typecheck --force` 16/16 ve betikler, `biome check` 302 dosya, `lint:domain-terms` 253 dosya/0 bulgu, `lint:ui-terms` 0 bulgu, `db:check`, `db:migrate` 2x, `db:seed` 2x, `bun test` **518 başarılı / 0 başarısız (14.031 assertion, 79 dosya)**, `verify:phase1`, `verify:phase4`, `verify:phase5`, `verify:phase6`, `verify:phase7`, `verify:phase7:durable` (gerçek PostgreSQL + DBOS: imzalı webhook → kuyruk → yanıt → gönderim; yinelenen teslimat ikinci mesaj üretmedi).

Bilinçli sınırlar: yapay zekâ yanıt üreticisi Faz 9'da bağlanır (çalışan bunu dışarıdan alır; `main.ts` yanıt üreticisi yoksa işleyici kaydetmez, yeni ortam değişkeni yoktur). Simülatör uç noktası Deneme Ekranı (T-10.12) ile gelir. Ayrı süpürücü iş yoktur: bekleyen yinelenen mesajlar sağlayıcı yeniden gönderince aynı iş kimliğiyle yeniden sıraya alınır. Sıradaki faz **Faz 8 — Ses**.


## Faz 8 — Ses (T-8.1 – T-8.6) tamamlandı (2026-11-07, Claude + 4 alt ajan)

- `@flowcore/voice` ortak `VoiceModelSession` sözleşmesini sunar; realtime ve kademeli mod aynı olay akışını üretir. Alt modüller ad çakışması olmaması için `realtime`, `web`, `processing`, `cascade` ad alanlarıyla dışa aktarılır.
- Zorunlu yeni ortam değişkeni yok; `LIVEKIT_*` ve `AMI_*` isteğe bağlıdır.
- **BLOCKED:** T-8.7 (Studio'ya bağlı) ve T-8.8 (T-11.1'e bağlı) bağımlılıkları gelince yapılacak. Web görüşme KVKK/kayıt onayı ertelenmiştir; kayıt kodu yazılmadı.

Doğrulama (hepsi exit 0): `typecheck --force` 16/16, Biome 363 dosya, `lint:domain-terms` 313 dosya/0 bulgu, `lint:ui-terms` 0 bulgu, `db:check`, `db:migrate` 2x, `bun test` **572 başarılı, 0 başarısız**.


## Faz 9 — AI özellikleri (T-9.1 – T-9.6) tamamlandı (2026-11-07, Claude + 4 alt ajan)

- Tüm model çağrıları enjekte edilen `LlmClient` üzerinden geçer ve `withUsageRecording` ile `recordUsage` noktasına düşer (T-11.3 kotası sonradan bağlanır). `@flowcore/ai` alt modülleri ad alanıyla sunulur: `architect`, `assist`, `multiagent`, `guardrails`, `evaluation`, `privacy`.
- Şema 27 tabloya çıktı (`data_requests`, `semantic_cache`). `data_requests` kişi silinse de kalır ve silinen içeriği barındırmaz. Dışa aktarma paketi 1 saat geçerlidir.
- Zorunlu yeni ortam değişkeni yok.
- **Doğrulanması gerekenler:** (1) T-9.6 kişi bağlama kuralları (oturum/konuşma/snapshot eşleşmesi ve alan değeri kişi kimliğine eşitse bağlı kayıt) ajan tarafından seçildi; iş kuralı olarak onaylanmalı. (2) Anlamsal önbellek aramasında yalnız kiracının son 500 kaydı taranır. (3) Çok ajanlı durum bellekte tutulur, kalıcı değildir. (4) Gizlilik DBOS işi yalnız tip kontrolünden geçti, gerçek kuyrukta denenmedi.

Doğrulama (hepsi exit 0): `typecheck --force` 16/16, Biome 402 dosya, `lint:domain-terms` 352 dosya/0 bulgu, `lint:ui-terms` 0 bulgu, `db:check`, `db:migrate` 2x, `bun test` **633 başarılı, 0 başarısız**.


## Faz 10 — Studio (T-10.1 – T-10.13) ve T-8.7 (Web Görüşme Deneyimi) tamamlandı (2026-11-07, Antigravity + 5 alt ajan)

- **Ortak Arayüz & Kabuk (`T-10.1`):** `@flowcore/ui` içinde ortak Türkçe sözlük (`glossary.ts` ve `glossary/*.ts`), açık/koyu çift tema değişkenleri (`theme.css`), opak Clay/Neo derinlik sistemi (`depth.module.css`, cam/bulanıklık efekti yok), `InfoTooltip` ve temel arayüz bileşenleri oluşturuldu. `apps/studio` içinde Next.js 16 + React 19 kabuğu, organizasyon/çalışma alanı seçicisi ve yalnızca kurucu/yönetici rollerine açık **Geliştirici Modu** kapısı kuruldu.
- **Kayıt Türleri, Koşullar ve İşlemler (`T-10.2` – `T-10.4`):** 12 alan türü için sade Türkçe yönetim ve 409 sürüm çakışması uyarısı (`/kayit-turleri`); görsel mod (`[Etiket]` çipleri, `ve`/`veya`), cümle modu (`parseTr`/`describeTr`) ve canlı önizleme (`evaluate`) içeren koşul oluşturucu (`/kosullar`); 30 yerleşik işlem, ham `{{secret:...}}` söz dizimini sızdırmayan bağlantı anahtarı seçicisi ve 3 adımlı işlem şablonu sihirbazı (`/islemler`) tamamlandı.
- **Akış Tuvali, Yayın Öncesi Kontrol ve Sürümler (`T-10.5` – `T-10.7`):** `@xyflow/react` + `elkjs` otomatik yerleşimli akış tuvali ve doğrulama rozetleri (`/akislar`); sade Türkçe sorun listesi, `"Sorunu göster"` odaklaması, deneme ve değerlendirme kapısı (`evalGate`) özeti sunan yayın öncesi kontrol paneli; `describeTr` ile Türkçe sürüm farkı, `ConfirmModal` geri alma onayı ve aktif konuşmaların başladıkları sürümde tamamlanacağını açıklayan `InfoTooltip` (`/surumler`) eklendi.
- **Bilgi Tabanı, Kanallar, Gelen Kutusu, Asistanlar, Deneme Ekranı, Kişi Verisi ve Ekip (`T-10.8` – `T-10.13`):** Koleksiyonlar, dosya/URL/Soru-Cevap kaynakları, `"Bu soruya ne bulur?"` denemesi, SSS önerisi onayı ve bağlam kaynağı (`/bilgi-tabani`); WhatsApp (3 yöntem), Telegram ve web sohbet için maskeli bağlantı anahtarlı 3 adımlı sihirbaz (`/kanallar`); süzgeçli/imleçli konuşma listesi, `"Konuşmayı üstlen"` / `"Asistana geri ver"` ve `"Bildirimleri kapattı"` rozeti (`/gelen-kutusu`); asistan yönetimi (`/asistanlar`); adım ve `[Etiket]` izlemeli deneme ekranı (`/deneme-ekrani`); kişi verisi dışa aktarma/anonimleştirme/onaylı silme (`/kisi-verisi`) ile ekip ve tek seferlik davet anahtarı yönetimi (`/ekip-ve-davetler`) tamamlandı.
- **Web Görüşme Deneyimi (`T-8.7`):** `@flowcore/voice` altında `<flowcore-voice-widget>` ve `VoiceWidgetController` ile `"Sesli konuş"`, bas-konuş / sürekli dinle, canlı altyazı, aynı `conversationId` üzerinde yazışmaya geçiş, zengin kartlar, ekran/kamera paylaşımı bayrakları + `VoiceAvatarAdapter`, `"Beni arayın"` geri arama devri, 30 sn otomatik yeniden bağlanma, klavye/erişilebilirlik ve varsayılan `recordingEnabled: false` (`recordingConsent?: boolean` genişletme noktası) tamamlandı.

Doğrulama (hepsi exit 0): `bun run typecheck --force` 16/16 paket, `bun run lint` (Biome 498 dosya, 0 hata), `bun run lint:domain-terms` (448 dosya, 0 bulgu), `bun run lint:ui-terms` (46 dosya, 0 bulgu), `bun run db:check`, `bun run db:migrate` 2x, `bun test` **700 başarılı, 0 başarısız (14.974 assertion, 109 dosya)**. Sıradaki faz **Faz 11 — Gözlemlenebilirlik, kotalar ve yayın hazırlığı (`T-11.1` – `T-11.5` ve `T-8.8`)**.


## Faz 11 — Gözlemlenebilirlik, Kotalar, Dağıtım (T-11.1 – T-11.5), T-8.8 (Ses Kalite İzleme) ve Uçtan Uca Doğrulama tamamlandı (2026-11-07, Antigravity + 3 alt ajan)

- **OpenTelemetry ve Opsiyonel Langfuse (`T-11.1` & `T-11.2`):** `@flowcore/core` altında `withStepSpan`, `withActionSpan`, `withLlmSpan` ve `recordVoiceQualityTelemetry` yardımcıları, `AsyncLocalStorage` tabanlı iz/üst-span yayılımı ve opsiyonel OTLP HTTP dışa aktarıcısı eklendi; çalışma zamanı motoruna (`packages/runtime/src/engine.ts`), işlem kayıt defterine (`packages/actions/src/registry.ts`), model sarmalayıcısına (`packages/ai/src/llm.ts`) ve ses kalite izleyicisine (`packages/voice/src/quality/monitor.ts`) bağlandı. `createLangfuseObserver` yalnızca `LANGFUSE_PUBLIC_KEY` ve `LANGFUSE_SECRET_KEY` tanımlı olduğunda etkinleşir ve hassas alanları maskeler.
- **Kiracı Token/Maliyet Kotası (`T-11.3`):** Faz 6 ve 9'da bırakılan `recordUsage` ve `withUsageRecording` noktalarına çağrı yerleri değiştirilmeden bağlandı (`QuotaManager`, `QuotaExceededError`). Aylık jeton ve maliyet sınırları, %80 uyarı eşiği ve sınır aşımında HTTP 429 `"Bu ayki kullanım sınırınız doldu."` yanıtı uygulandı; sınır aşan kiracı engellenirken diğer kiracılar etkilenmez.
- **Denetim Kaydı ve Gözlemlenebilirlik Şeması (`T-11.4`):** Drizzle şemasına değişmez (append-only RLS) `audit_logs` ve `tenant_quotas` tabloları eklendi (toplam **29 tablo**). `/api/tenants/{tenantId}/quota` (`GET`/`PUT`) ve `/api/tenants/{tenantId}/audit-logs` (`GET`/`POST`) uçları Hono uygulamasına ve OpenAPI şemasına eklendi.
- **Ses Kalite İzleme (`T-8.8`):** `@flowcore/voice/quality` altında görüşme başına TTFA, tur gecikmesi, kesme sayısı, paket kaybı, gecikme dalgalanması, ITU-T G.107 E-model MOS tahmini ve sessizlik oranı hesaplaması, eşik aşımı uyarıları, otomatik düşük bant genişliği / yedek bağlantı önerisi ve Studio **"Görüşme Kalitesi"** (`/gorusme-kalitesi`) ekranı tamamlandı.
- **Dağıtım ve Uçtan Uca Simülasyon (`T-11.5` & Bölüm 7.4):** `apps/{api,worker,voice-gateway,studio}/Dockerfile`, `docker-compose.prod.yml`, `scripts/docker-entrypoint.sh` (Dokploy `POSTGRES_HOST_OVERRIDE` / `REDIS_HOST_OVERRIDE` uyumu ve kapsayıcıyı çökertmeyen idempotent migrasyon) ve `.env.example` tamamlandı. Sektörden bağımsız **"Talep toplama + rezervasyon"** örnek şablonu Web sohbet, WhatsApp (fixture) ve Telegram (fixture) kanallarında uçtan uca doğrulandı.

Doğrulama (hepsi exit 0): `bun run typecheck --force` 16/16 paket, `bun run lint` (Biome 517 dosya, 0 hata), `bun run lint:domain-terms` (470 dosya, 0 bulgu), `bun run lint:ui-terms` (48 dosya, 0 bulgu), `bun run db:check`, `bun run db:migrate` 2x, `docker compose -f docker-compose.prod.yml config --quiet`, `bun test` **719 başarılı, 0 başarısız (15.156 assertion, 115 dosya)**. Tüm fazlar (**Faz 0 – Faz 11**) tamamlanmıştır.




## Entegrasyon boşlukları kapatıldı (2026-11-07, Claude + alt ajanlar)

- **Model istemcisi ve otomatik yanıt:** `packages/ai/src/providers` (Gemini, OpenAI, `createLlmClientFromEnv`; yalnız fetch, zaman aşımı, 429/5xx için en çok 2 deneme, anahtar sızıntısı yok) ve `packages/ai/src/reply` (`createAgentReplyGenerator`: ajan ayarı, bilgi tabanı alıntısı, enjeksiyon/PII koruması). `apps/worker/src/auto-reply.ts` anahtar varsa konuşma işleyicisini kurar; anahtar yoksa otomatik yanıt kapalıdır. Kullanım kaydı yalnız `withUsageRecording` içinde yapılır (çift sayım düzeltildi).
- **Telegram webhook kaydı:** `apps/api/src/channel-webhooks.ts`; kayıt/pasifleştirme/silmede `getMe`+`setWebhook`/`deleteWebhook`, `POST …/channel-connections/{id}/register-webhook`, genel adres yalnız opsiyonel `PUBLIC_BASE_URL`. Hata bağlantı kaydını bozmaz (`webhookStatus`).
- **Studio:** `dev`/`build`/`start` betikleri; `next build` ve 15 sayfa HTTP 200 doğrulandı.
- **Ses köprüsü:** `apps/voice-gateway/src/session-bridge.ts`; AudioSocket 8 kHz ↔ realtime adapter, barge-in, varsayılan kapalı kayıt, anahtarsız temiz kapanış.
- **Doğrulama betikleri:** `verify:phase8` – `verify:phase11`.
- **Hâlâ açık:** gerçek Gemini/OpenAI/Telegram/Asterisk/LiveKit denemesi yok (hepsi sahte yanıtlarla test edildi); ses oturumunda araç yürütücü ve kiracı/ajan çözümü bağlı değil; `PUBLIC_BASE_URL` yoksa Telegram webhook elle kaydedilir; Studio ekran–API bağlama işi sürüyor (aşağıdaki not güncellenecek).


- **Deneme Ekranı ve Görüşme Kalitesi uçları (T-10.12 / T-8.8):** `POST /api/tenants/{tenantId}/simulator/turns` (editor+; gerçek kanala göndermez, DB'ye konuşma yazmaz, anahtar yoksa 503 `AI_NOT_CONFIGURED`, dakikada 20 tur ve kota 429) ve `POST|GET /api/tenants/{tenantId}/voice/quality` (yeni `voice_call_metrics`, append-only, RLS, `ensureVoiceCallMetricsTable()`). **Şema artık 30 tablo** (önceki "29 tablo" notları tarihsel). Ses köprüsü çağrı bitince özeti `FLOWCORE_API_URL` + `FLOWCORE_API_SESSION_COOKIE` tanımlıysa yazar (ikisi de opsiyonel).
- **Studio ekran–API durumu:** Asistanlar, İşlemler (bağlantı anahtarı seçici), Koşullar (alan listesi), Deneme Ekranı, Görüşme Kalitesi API'ye bağlı; Akışlar, Sürümler, Kanallar, Gelen Kutusu, Bilgi Tabanı, Kişi Verisi, Kayıt Türleri, Ekip önceden bağlıydı.
- **Bilinen sınırlar:** simülatörde `collected`/`currentStep` boş (akış çalıştırılmıyor, yalnız ajan yanıtı); simülatör geçmişi bellek içi; paket kaybı/jitter/sessizlik gateway'de ölçülemediği için 0; gateway kalite raporu kullanıcı çerezi kullanır (servis hesabı belirteci gerekir); İşlemler ve Koşullar için kaydetme ucu yok; asistanlarda sunucu 409 yok (sürüm kolonu yok); Studio kalite paneli ilk 50 kaydı gösterir.
- Doğrulama (hepsi exit 0): typecheck, lint, lint:ui-terms, lint:domain-terms, db:check, db:migrate 2x, `bun test` **782 başarılı, 0 başarısız**, verify:phase8–11.


## Yayın (2026-11-07)

- Depo: `berat639/flowcore` (özel). Sunucu `/opt/flowcore` altında `docker compose -f docker-compose.dokploy.yml -f docker-compose.traefik.yml up -d --build` ile çalışır; Dokploy'un Traefik'i ve `dokploy-network` ağı kullanılır, Dokploy panelinde kayıtlı DEĞİLDİR. Alan adı: `asistan.thinpine.com` (Studio `/`, API `/api`). Gizli anahtarlar yalnız sunucudaki `.env` içindedir.
- Dersler: (1) Dockerfile'lar `tsconfig.base.json` dosyasını kopyalamalıdır. (2) `dokploy-network` içindeki başka kapsayıcılarla ad çakışmasını önlemek için veritabanı/Redis adları `flowcore-postgres` / `flowcore-redis` takma adlarıyla kullanılır.
- Güncelleme: kodu sunucuya gönderip aynı komutu yeniden çalıştırın.
