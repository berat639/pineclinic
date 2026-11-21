# Faz 6 — Bilgi tabanı

Kaynak: `packages/knowledge`, `apps/api/src/routes/knowledge.ts`,
`apps/api/src/knowledge-jobs.ts`, `apps/worker/src/knowledge.ts` ve
`packages/db/src/schema/knowledge.ts`.

## Kaynaklar ve bölümleme

Dosya, URL, düz metin ve Soru-Cevap kaynakları aynı belge modeline alınır.
TXT, Markdown ve CSV UTF-8 olarak okunur. PDF için `unpdf` 2.1.0, DOCX için
`mammoth` 1.13.0 gerçek metin çıkarımı yapar; ikili dosya düz metin sayılmaz.
Görüntüden oluşan taramalara OCR eklenmemiştir; metin çıkarılamayan kaynak
anlaşılır hatayla reddedilir.

Dosya sınırı 10 MiB, çıkarılmış metin sınırı 2 milyon karakterdir. PDF en çok
500 sayfa olarak işlenir. DOCX arşivi açılmadan giriş sayısı, sıkıştırma türü,
gerçek açılmış boyut ve toplam 20 MiB genişleme sınırı doğrulanır. Bozuk veya
aşırı büyük girdi veritabanına kısmi belge bırakmaz.

`chunkDocumentText` kaynak projenin başlık, paragraf, cümle ve örtüşme
davranışını korur. Varsayılan pencere 800, örtüşme 120 karakterdir. Yedi nötr
altın örnek kaynak davranışıyla eşdeğerliği denetler. Geçersiz pencere/örtüşme,
2 milyon karakteri veya 10.000 bölümü aşan girdi sessizce kesilmez; reddedilir.
İçerik kimliği normalize edilmiş başlık ve metnin SHA-256 özetidir.

URL içe aktarımı yalnız HTTP/HTTPS kullanır. Özel/yerel IP, metadata adresi,
kimlik bilgili adres ve güvenli olmayan DNS yanıtı reddedilir. Bütün DNS
yanıtları denetlenir ve onaylanan adres gerçek bağlantıya sabitlenir;
`fetch` ile ikinci bir DNS çözümüne güvenilmez. Her yönlendirme yeniden
denetlenir. Varsayılan sınırlar 15 saniye, üç yönlendirme ve 10 MiB yanıttır.
HTML'den betik/stil kaldırılarak metin alınır. İçe aktarma öncesi hedef
koleksiyonun aynı kiracıya ait ve etkin olduğu doğrulanır.

## Kalıcı model ve kapsam

Faz 6'nın beş yeni tablosuyla çekirdek şema 24 tabloya ulaştı; sonradan T-1.6
davet tablosuyla güncel toplam 25 oldu. Bilgi tabanı tabloları:

| Tablo | İçerik |
|---|---|
| `knowledge_collections` | Kiracı, asistan veya kanal kapsamı ve etkinlik |
| `knowledge_documents` | Kaynak, içerik özeti, revizyon, güncelleme durumu, model/boyut ve iş kimliği |
| `knowledge_chunks` | Sıralı metin bölümleri, belge revizyonu ve isteğe bağlı vektör |
| `knowledge_context_sources` | Kayıt türü, tetikleyici/filtre ifadeleri ve izinli alanlar |
| `knowledge_faq_suggestions` | Konuşmalardan önerilen soru/yanıt, sıklık ve değerlendirme durumu |

Her tabloda kiracı kimliği ve RLS vardır. Bileşik yabancı anahtarlar belge,
koleksiyon, asistan ve kayıt türünün farklı organizasyonlardan bağlanmasını
engeller. Mevcut idempotent migration ve başlangıç onarımı bu tabloları da
kapsar; yeni zorunlu ortam değişkeni yoktur.

Arama ve bağlam üretiminde genel koleksiyonlara ek olarak yalnız verilen
asistan veya kanalla eşleşen koleksiyonlar görünür. Asistan/kanal verilmezse
ilgili özel kapsam açılmaz. İsteğe bağlı `collectionId` sonuçları ayrıca daraltır.
Yönetim HTTP uçları kiracı üyeliği ve rol denetimi yapar; görüntüleyici okur,
editör/yönetici/sahip yazar. Yönetim erişimiyle konuşma kapsamı ayrı
sorumluluklardır. Servis çağıran kanal kodu kiracı/asistan/kanal kimliğini
doğrulamadan kullanıcıdan gelen değeri doğrudan bu servislere aktarmamalıdır.

## Hibrit arama ve model adaptörü

Türkçe PostgreSQL tam metin araması her zaman çalışır; başlıklar daha yüksek
ağırlık alır. Tam metin indeksleri GIN, model/boyut süzmesi B-Tree kullanır.
`pgvector` varsa ve sorgu modeli/boyutu belgeyle eşleşiyorsa kosinüs araması
da yapılır. İki sıralama RRF ile birleştirilir; birbirinden farklı ham puanlar
doğrudan toplanmaz. Belge başına en iyi iki bölüm kaynak sırasıyla döner.

Vektörler boyutsuz PostgreSQL `real[]` alanında, model/boyut metadatasıyla
tutulur ve arama sırasında `vector` türüne çevrilir. Böylece isteğe bağlı
eklenti bulunmadığında migration ve metin araması çalışır. Vektör araması
model/boyut süzmesinden sonra hesaplanır; bu aşamada her model için HNSW
indeksi üretilmez. Büyük veri kümelerinde boyuta/model adına özel indeksleme
ayrıca ölçülüp eklenmelidir.

`EmbeddingAdapter` model, boyut ve toplu `embed` sözleşmesidir. Varsayılan
isteğe bağlı adaptör mevcut `GEMINI_API_KEY` ile resmi Gemini
`batchEmbedContents` protokolünü, `gemini-embedding-001` modelini ve 768 boyutu
kullanır. Belge ve sorgu görevleri ayrıdır. Anahtar eksik/geçersizse servis
metin aramasıyla açılır; sahte anlamsal vektör üretilmez.

Yanıtta boyut, sonlu değer, sıfır vektör ve `real` taşması denetlenir. Toplu
işler sınırlı eşzamanlılıkla yürür. Önbellek anahtarı kiracı, model, boyut,
görev ve metni kapsar; varsayılan 1.000 giriş/5 dakika TTL ile LRU uygulanır.
Hatalı sağlayıcı metin sonuçlarını kaldırmaz.

İsteğe bağlı reranker yalnız yetkili adayları yeniden sıralayabilir; yeni
kaynak ekleyemez. Hatalı/tekrarlı kimlik veya geçersiz puan reddedilir.
Varsayılan iki saniyelik süre dolunca iptal işareti gönderilir ve mevcut
sıralamaya dönülür.

## DBOS ile yeniden güncelleme

API `flowcore-knowledge-index` kuyruğuna `flowcore.knowledge-index.v1` işi
gönderir; model çağrısını HTTP isteğinde çalıştırmaz. Ayrı worker işleyicisi
DBOS başlatılmadan önce kaydedilir, böylece eski işler yeniden başlatmada
tanınır. Yeni kaynak/düzenleme sırasında metin bölümleri hemen yazılır;
anlamsal arama hazır olana kadar tam metin araması kullanılabilir.

İş; kiracı, belge, beklenen revizyon, model, boyut ve ayrı `indexToken`
taşır. Belge düzenlenince eski vektörler geçersizleşir. Yeni güncelleme
isteği aynı içerik revizyonunda bile yeni kimlik alır. Eski içerik veya eski
model işi son isteğin durumunu/bölümlerini değiştiremez.

Model çağrısı veritabanı transaction'ının dışında yapılır; bölüm değişimi
revizyon ve iş kimliğiyle atomik CAS uygular. Durumlar `pending`, `indexing`,
`ready`, `failed`, `unavailable` olarak saklanır. Aynı DBOS iş kimliğini tekrar
kuyruğa koymak yeni iş oluşturmaz; yeni bir kullanıcı güncellemesi yeni kimlik
alarak başarısız bir işi yeniden denemeyi sağlar.

Bir model çağrısı ile yerel checkpoint arasında süreç kapanırsa model çağrısı
yeniden yapılabilir ve sağlayıcı ücreti tekrar oluşabilir. Son bölüm kayıtları
atomik olarak değiştirilir; iki çağrı iki kopya bölüm bırakmaz. Kabul testi bu
aralıkta gerçek `SIGKILL` uygular.

## Kayıtlardan bağlam ve konuşmalardan SSS

`createContextSourceService` tetikleyici Expr'yi çağıranın bağlamında değerlendirir.
Koşul sağlanırsa izinli EntityType kayıtlarını parametreli filtreyle sorgular.
Ham SQL veya çalıştırılabilir kod kabul edilmez. Alanlar tanım ve etiketleriyle
seçilir; kişisel olarak işaretli alanlar ve telefon/e-posta gibi hassas türler
projeksiyona/filtreye alınmaz. Hassasiyet her okumada yeniden denetlenir.
Satır, alan, değer ve prompt boyutları sınırlıdır. Dönen kayıtlar açıkça
alıntılanmış veri olarak eklenir.

`createKnowledgeRetrieval` arama sonuçlarını ve koşullu kayıt bağlamını tek
sınırlı prompt parçasında birleştirir. `createKnowledgeActionAdapter` ise
işlem kataloğunun `ai.kbSearch` adaptörünü sabit kiracı/asistan/kanal kapsamına
bağlar. Model/kanal uygulaması bu prompt parçasını kendi üst düzey yönergesine
ekler; kaynak içeriği talimat yetkisi kazanmaz.

SSS servisi yalnız aynı kiracının kapanmış konuşmalarındaki tamamlanmış
gelen soru/giden yanıt çiftlerini okur. Koleksiyonun asistan/kanal kapsamı
önce uygulanır. Normalize edilmiş soru ve konuşma kimlikleriyle tekrarlar
birleşir; yeniden öneri üretmek sayıyı şişirmez. Telefon/e-posta/kimlik gibi
tanınan kişisel veriler saklama ve isteğe bağlı sağlayıcı çağrısı öncesinde
maskelenir. Bu maskeleme tüm kişisel bilgi türlerini tanıyan bir DLP sistemi
yerine geçmez; öneriler insan değerlendirmesinden geçer.

Öneriler `pending` olarak kalır. Açık onay aynı transaction'da Soru-Cevap
kaynağı ve metin bölümleri oluşturur; tekrar onay ikinci belge oluşturmaz.
Ret belge yayımlamaz. İsteğe bağlı dönüşüm sağlayıcısı sınırlı/metni maskelenmiş
çiftler ve iptal işareti alır; iki saniyede yanıt gelmezse güvenli hata döner.

## HTTP uçları

Önek: `/api/tenants/{tenantId}/knowledge`. Tüm uçlar mevcut httpOnly oturumla
korunur ve OpenAPI belgesinde yer alır.

| Yol | Yöntem / amaç |
|---|---|
| `/collections`, `/collections/{id}` | Oluştur/listele/düzenle/sil |
| `/documents` | JSON ile metin/URL/Soru-Cevap oluştur veya kaynakları listele |
| `/documents/file` | `multipart/form-data` ile `collectionId`, `title`, `file` yükle |
| `/documents/{id}` | Oku, beklenen revizyonla düzenle, sil |
| `/documents/{id}/reindex` | DBOS güncellemesi başlat; sağlayıcı/hizmet yoksa açıklayıcı 503 |
| `/search` | Kapsamlı hibrit arama |
| `/retrieve` | Arama ve dinamik bağlamdan sınırlı prompt parçası üret |
| `/context-sources`, `/context-sources/{id}` | Tetik/filtre ve alan tanımları oluştur/listele/düzenle/sil |
| `/context` | Koşullu kayıt bağlamı üret |
| `/faq/suggest`, `/faq` | Konuşmalardan öneri üret/listele |
| `/faq/{id}/approve`, `/faq/{id}/reject` | Öneriyi değerlendir |

Belge/koleksiyon yönetiminde olmayan hedefler kiracılar arasında veri açmaz.
Doğrulama hataları Türkçedir; ham sağlayıcı yanıtı veya bağlantı anahtarı
HTTP hatasına/loga konmaz. Dosya yüklemesi dışındaki istekler mevcut 1 MiB
gövde sınırını korur; dosya ucu 10 MiB + sınırlı form ek yükü kabul eder.

## Doğrulama ve sınırlar

`bun run verify:phase6`, mevcut veritabanını sıfırlamadan geçici PostgreSQL
veritabanları açar ve sonunda temizler. Gerçek HTTP, pgvector/FTS, DBOS
kuyruğu, kiracı RLS, asistan kapsamı, revizyon/iş kimliği yarışları, dinamik
prompt, SSS onayı ve işlem adaptörünü sınar. Ayrı worker sürecini güncelleme
ortasında `SIGKILL` ile kapatır; yeniden başlatıldığında iki model denemesine
karşı tek son bölüm kaydı oluştuğunu doğrular.

Kabulde deterministik model adaptörü kullanılır; gerçek Gemini protokolü
birim testinde sınanır. Ücretli sağlayıcının canlı kalite/gecikme ölçümü için
gerçek anahtar ve ayrıca değerlendirme verisi gerekir. Kaynak URL taşıması
gerçek `https://example.com` bağlantısıyla ayrıca doğrulanmıştır. PDF/DOCX
testleri gerçek geçerli ikili dosyaları kullanır. Ayrıntılı son komut ve
sayılar [ilerleme kaydındadır](progress.md).
