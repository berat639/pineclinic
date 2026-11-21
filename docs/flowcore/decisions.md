# FlowCore — Kararlar ve Açık Sorular

## Alınmış Kararlar

| # | Karar | Gerekçe | Tarih |
|---|---|---|---|
| D-1 | Ayrı repo: `~/Desktop/flowcore` | voiceai'den bağımsız, sektörden bağımsız ürün | 2026-11-06 |
| D-2 | TypeScript + Bun + Hono + Drizzle + Postgres/pgvector | voiceai'den en çok kod taşınabilir; AI SDK, MCP, DBOS, xyflow TS'de birinci sınıf | 2026-11-06 |
| D-3 | Vercel AI SDK + kendi flow runtime; Mastra yok | Codegen ile üretilen durum makinesi çekirdek; Mastra workflow'ları çakışır | 2026-11-06 |
| D-4 | DBOS Transact; BullMQ yok; Redis yalnız hot state | Durable iş yalnız Postgres ile; ek orkestrasyon sunucusu yok | 2026-11-06 |
| D-5 | Dinamik veri: JSONB + codegen ile generated column/index + opsiyonel materialize tablo | Esneklik + sorgu performansı | 2026-11-06 |
| D-6 | Çok kiracılı: `tenantId` + `workspaceId`; çok ajanlı | Sektörden bağımsız SaaS | 2026-11-06 |
| D-7 | Web ses: LiveKit birincil + WebSocket otomatik yedek | Ağ dayanıklılığı + zorunlu altyapı olmadan çalışma | 2026-11-06 |
| D-8 | Arayüzde teknik terim yok | Teknik olmayan kullanıcılar | 2026-11-06 |
| D-9 | Plan model-bağımsız (Claude, Gemini, Codex, Copilot) | Farklı IDE'lerle devam edebilme | 2026-11-06 |
| D-10 | Web görüşme KVKK/kayıt onayı ertelendi | Kullanıcı talebi; yalnız genişletme noktası bırakılır | 2026-11-06 |
| D-11 | Codegen artifact teslimi hibrit: runtime modül DB'de, SDK/DDL CLI ile dışa | Çalışma zamanı hızı + geliştirici erişimi | 2026-11-06 |
| D-12 | Şifreleme anahtarı için gömülü varsayılan yok; anahtar yoksa bağlantı bilgisi kaydetme kapalı | Güvenlik + zorunlu env olmadan açılma | 2026-11-06 |
| D-13 | Kiracı izolasyonu Postgres RLS + `tenant_id`; Argon2id; httpOnly oturum | Çok kiracılı veri sızıntısını veritabanı seviyesinde engelleme | 2026-11-06 |
| D-14 | Kullanıcı kimliği genel; kiracı üyeliği ve rol `memberships` üzerinde. Diğer kiracı kayıtları bileşik yabancı anahtarlarla bağlanır. | Aynı kullanıcının birden fazla kiracıya katılabilmesi ve kiracılar/çalışma alanları arasında hatalı ilişkilerin veritabanınca reddedilmesi (T-1.1) | 2026-11-07 |
| D-15 | Dinamik kayıt türleri kiracı kapsamında; alan referansı aynı kiracının hedef türünü belirtir. | Çalışma alanları arasında tanım tekrarını önlemek ve tür/alan/kayıt ilişkilerini bileşik yabancı anahtarlarla korumak (T-1.2). Alan doğrulama ve indeks üretimi sonraki kartlara aittir. | 2026-11-07 |
| D-16 | İfade ağacı `kind` ayrımlı ve katıdır; `between` alt/üst sınırı ayrı alır, liste `any/all` koşulu `item.*` kapsamını kullanır. | Sabit JSON sözleşmesi; zararsız doğrulama için 64 derinlik, 10.000 düğüm/değer, 120 karakterlik sabit metin ve sınırlı güvenli desen alt kümesi uygulanır (T-2.1). Çalıştırma semantiği T-2.2'de tanımlanır. | 2026-11-07 |
| D-17 | Yorumlayıcı yalnız kendi özelliklerini çözer, mantığı kısa devre eder ve eksik/uyumsuz karşılaştırmaları eşleşme saymaz. `now` değerlendirme başına sabit, `item.*` liste öğesi kapsamındadır. | Kaynak tüketimi tek değerlendirme boyunca paylaşılır: ziyaret, liste, karakter, değer işi ve güvenli desen adımı bütçeleri. Güvenli desenler geri izleme yapmayan motorla çalışır; konak kancaları eşzamanlı ve uyumlu sonuçla sınırlıdır (T-2.2). | 2026-11-07 |
| D-18 | Türkçe koşul dili etiket tabanlıdır; serbest metinde iç başvuru yolları kabul edilmez ve anlatıcı bilinmeyen yolları göstermez. | Yerelleştirilmiş arayüzle dahili AST ayrımını korumak; `ve`/`veya` önceliği, parantezler ve kaçışlı metinlerle kararlı parse/describe/parse gidiş-dönüşü sağlamak (T-2.3). | 2026-11-07 |
| D-19 | Sistem bağlamı kurucusu yalnız çağıranın sağladığı ve önceden yetkilendirilmiş veriyi normalize eder; kiracı depolamasına erişmez. | Sistem saat değişkenleri açık bir saat diliminde hesaplanır; işletme saatleri haftalık plan + gün istisnası ile ifade edilir. Bağlam girdisi sınırlandırılır, JSON verisi kopyalanıp dondurulur ve geçersiz girdiler kapalı biçimde reddedilir (T-2.4). | 2026-11-07 |
| D-20 | Derleyici (Codegen) 9 deterministik hedef üretir; yayınlanan `flow_versions` ve `artifacts` satırları veritabanı rolü (`SELECT, INSERT`) ve uygulama katmanında değişmezdir (immutable). | Sabit değerler JS hedefinde yalnızca bağlam dizisi (`__l[idx]`) ve SQL hedefinde yalnızca `$1..$n` parametreleriyle taşınır; PostgreSQL 17 generated column kısıtlarına uygun olarak indeksli JSONB ifadeleri `IMMUTABLE` metin/ifade indeksleriyle üretilir ve çalışan oturumlar başladıkları `flow_version_id` üzerinde tamamlanır (T-3.1–T-3.10). | 2026-11-07 |
| D-21 | PostgreSQL checkpoint yetkilidir; Redis yalnız DB başlığı ve durum özetiyle doğrulanan isteğe bağlı önbellektir. | Kiracı RLS, sabit sürüm, transaction kapsamlı oturum kilidi ve CAS revizyonu birlikte kullanılır. Önbellek yalnız commit sonrasında güncellenir. Veritabanı işlem kancaları aynı transaction bağlantısını alır (T-4.1–T-4.3). | 2026-11-07 |
| D-22 | DBOS Transact 5.4.0 worker Bun 1.3.13 ile çalışır; uzun işler ses turundan ayrılır. | Gerçek PostgreSQL üzerinde SIGKILL sonrası beş işin kurtarılması doğrulandı. İş kimliği kiracı/oturum/bekleme anahtarına bağlıdır; uzak etkiler sabit sağlayıcı tekilleştirme anahtarı gerektirir (T-4.4). | 2026-11-07 |
| D-23 | Bilgi tabanı kapsamı kiracı/genel, asistan veya kanaldır; arama ve dinamik bağlam yalnız eşleşen kapsamları birleştirir. | Beş tenant/RLS tablosu ve bileşik yabancı anahtarlarla kaynak, bölüm, kayıt türü ve öneri sınırları veritabanında korunur (T-6.1–T-6.3). | 2026-11-07 |
| D-24 | Vektörler model/boyut metadatasıyla `real[]` saklanır; pgvector varsa kosinüs + Türkçe FTS, RRF ile birleşir. | İsteğe bağlı eklenti/sağlayıcı bulunmadığında migrasyon ve metin araması çalışır. Varsayılan Gemini adaptörü mevcut opsiyonel anahtarı kullanır; sahte vektör üretilmez (T-6.3–T-6.4). | 2026-11-07 |
| D-25 | Bilgi güncellemesi DBOS kuyruğunda; içerik revizyonu ve istek kimliğiyle CAS, metin bölümleri hemen hazır. | Eski içerik veya aynı revizyondaki eski model işi yeni isteği ezemez. Çökmede model çağrısı yinelenebilir; son bölüm değişimi atomiktir. Gerçek SIGKILL kurtarması doğrulandı (T-6.4). | 2026-11-07 |
| D-26 | Dinamik bağlam izinli/hassas olmayan alanlardan sınırlı veri üretir; konuşma SSS önerileri yalnız açık onayla yayımlanır. | Parametreli sorgu, Expr tetik/filtre, kapsam ve kişisel veri maskelemesi kullanılır. Kaynak metni talimat yetkisi kazanmaz; öneri üretimi otomatik yayın değildir (T-6.6–T-6.7). | 2026-11-07 |
| D-27 | Plana kart eklendi: T-1.6 (kanal/konuşma/üyelik API), T-7.6 (Gelen Kutusu API), T-9.6 (kişi verisi dışa aktarma/silme), T-10.13 (ekranlar). `recordUsage` kancası Faz 6/9'da bırakılır, T-11.3 kotası sona kalır. | Faz 10 ekranlarının API sahibi kart yoktu; kişi verisi silme/dışa aktarma eksikti; kota çağrı noktaları sonradan değişmesin. Çakışan eski D-23 numarası D-27 olarak düzeltildi. | 2026-11-07 |
| D-28 | Kanal kimlik bilgisi yalnız yazılır; genel yanıtlar sabit projeksiyon ve açık ayar izin listesi kullanır. Üyelik yönetimi tenant kilidiyle seri; davet e-postaya bağlı, süreli ve tek kullanımlıdır. | Şifreli zarf da okunmaz; anahtar yokken yalnız kimlik bilgisi yazımı kapanır. Son sahip ve yönetici→sahip yükseltme engellenir. Davet anahtarı paylaşım için yalnız oluşturana tek sefer döner; veritabanında özeti saklanır, listelenmez/loglanmaz (T-1.6). | 2026-11-07 |
| D-29 | Kanal olayları ortak sözleşmeyle (`ChannelAdapter`) işlenir; konuşma kilidi süreli kiralama (lease) ile tutulur, "gönderiliyor" işareti gönderimden önce kalıcı yazılır; belirsiz gönderim asla yeniden denenmez ve yapay zekâyı duraklatır. | Süreç ölse bile kilit kendiliğinden serbest kalır; mesaj ikinci kez gitmez (T-7.5). Web sohbet gönderimi yalnız kayıttır; API süreci olay akışıyla veritabanından okur (çalışan farklı süreçtir). | 2026-11-07 |
| D-30 | Sağlayıcı aynı mesajı yeniden gönderirse ve mesaj hâlâ bekliyorsa iş aynı iş kimliğiyle yeniden sıraya alınır; ayrı süpürücü yoktur. Web sohbet ziyaretçi anahtarı bağlantı oluşturulurken otomatik üretilir ve şifreli saklanır. | İlk sıraya alma başarısız olsa bile mesaj kaybolmaz; çift işlem oluşmaz (kuyruk iş kimliğiyle tekilleştirir). Yeni ortam değişkeni gerekmez (T-7.4/T-7.5). | 2026-11-07 |

## Açık Sorular

| # | Soru | Kart | Durum |
|---|---|---|---|
| Q-1 | Plan onayı | T-0.1 | Kapalı — Kullanıcı onayladı (2026-11-06) |
| Q-2 | DBOS Transact Bun ile çalışıyor mu? Değilse worker Node.js 22+ | T-4.4 | Kapalı — DBOS 5.4.0 + Bun 1.3.13 gerçek PostgreSQL ve SIGKILL kurtarma testinde geçti; Node geçişi gerekmedi (2026-11-07) |
| Q-3 | Evolution API (resmi olmayan) desteklensin mi? | T-7.2 | Kapalı — Destekli, arayüzde "önerilmez" olarak işaretlenir; varsayılan Meta Cloud (2026-11-07) |
