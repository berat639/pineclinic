# T-1.5 — Çekirdek API

`bun run --cwd apps/api start` Hono sunucusunu başlatır. Port mevcut opsiyonel
`API_PORT` ile seçilir; geçersiz değerde 4000 kullanılır. Başlangıçta şema ve
kiracı politikaları onarılır. Veritabanı hazır değilse süreç sağlık durumunu
503 olarak sunar ve yeniden dener. `/openapi.json` çalışan yolların OpenAPI
belgesini, `/health` gerçek veritabanı bağlantısının durumunu sunar.

## Kaynak yolları

Organizasyonların koleksiyon yolu `/api/tenants`, tekil yolu
`/api/tenants/{tenantId}` şeklindedir. Diğer kaynaklar
`/api/tenants/{tenantId}/{kaynak}` altında, detay/güncelleme/silme yolu
`/{id}` ekiyle sunulur:

| Kaynak | Oluşturma bilgileri |
|---|---|
| `workspaces` | `name` |
| `agents` | `workspaceId`, `name`, isteğe bağlı `status` ve `config` |
| `contacts` | İsteğe bağlı `name`, `attributes`, `tags` |
| `entity-types` | `key`, `label`, isteğe bağlı `description` |
| `field-definitions` | `entityTypeId`, `key`, `label`, `type`, alan bayrakları ve metadata |
| `records` | `entityTypeId`, JSON nesnesi `data` |

Koleksiyonlar GET/POST, tekil yollar GET/PATCH/DELETE destekler. Başarılı
tekil yanıt `{data: ...}`, liste yanıtı `{data: [...], pagination:{limit,offset}}`,
silme yanıtı `{success:true}` biçimindedir. Teknik alan adları API sözleşmesidir;
Studio arayüzüne bu adlar doğrudan gösterilmeyecektir.

## Güvenlik ve veri bütünlüğü

Her kaynak önce oturum çerezini doğrular. Organizasyon içindeki işlem güncel
DB üyeliğiyle `withTenant` üzerinden yapılır. Listeleme bile üye olunmayan
organizasyona erişim vermez. Kullanıcı, oturum, parola veya şifreli bağlantı
bilgisi tabloları genel CRUD'a açılmaz.

Görüntüleyiciler yalnız okur. Düzenleyiciler temel veri oluşturup güncelleyebilir;
kayıt türü/bilgi alanı tanımlarını yönetemez ve silme yapamaz. Tanım değişikliği
ve alt kayıt silme sahip/yönetici, organizasyon silme yalnız sahip yetkisi ister.
Organizasyon oluşturma ile sahip üyeliği aynı işlemde tamamlanır. İlişkili veri
varken organizasyon silme reddedilir ve silinmeye çalışılan üyelikler de işlem
geri almasıyla korunur.

Girdi şemaları bilinmeyen alanları reddeder. UUID, teknik anahtar, metin uzunluğu,
alan türü, JSON nesnesi, referans hedefi ve saat dilimi doğrulanır. JSON değeri
derinliği en fazla 32 olabilir; iç içe özel nesne anahtarları da reddedilir. Kaynak/sütun
adları sunucunun sabit listesinden gelir; değerler SQL parametresidir.

Dinamik kayıt PATCH gövdesi `{data,version}` bekler. `version` mevcut sürümle
eşleştiğinde veri güncellenir ve sürüm atomik artırılır. Eski sürüm 409 verir;
başarılı ilk değişiklik korunur. Genel liste sayfalaması `limit` 1–100 ve
`offset` 0–1.000.000 ile sınırlıdır. Bilgi alanı ve kayıt listeleri isteğe bağlı
`entityTypeId` filtresi alır.

Veritabanı tekillik ve ilişki hataları ham SQL/değer göstermeyen Türkçe 400/409
yanıtlarına çevrilir. Bozuk JSON 400, kimliksiz erişim 401, yetkisiz kapsam 403,
bulunamayan kayıt 404 ve bilinmeyen sunucu hatası güvenli 500 üretir.

Alan türü metadatasından kayıt değeri doğrulayıcısı üretilmesi T-3.4 kapsamındadır;
bu API aşaması JSON nesnesi ve mevcut ilişkisel kısıtları uygular.

## Testler

HTTP testleri gerçek PGlite PostgreSQL 17 üzerinde kayıt/giriş/çıkışı, çerez ve
kaynak kontrollerini, altı kaynakta CRUD döngüsünü, organizasyon yaşam döngüsünü,
RBAC, kiracı izolasyonu, sürüm çakışması, referans değişimi, sayfalama ve OpenAPI
yollarını denetler. Ayrıntılı son sonuçlar `progress.md` içinde tutulur.


## Faz 6 — Bilgi tabanı yolları

Bilgi tabanı HTTP uçları `/api/tenants/{tenantId}/knowledge` altında mevcut
oturum/rol denetimi ve OpenAPI ile eklenmiştir. Kaynak içe aktarma, dosya
yükleme, arama, DBOS güncellemesi, koşullu bağlam ve SSS değerlendirmesinin
sözleşmesi [bilgi tabanı belgesindedir](knowledge.md).


## T-1.6 — Kanal, konuşma ve üyelik yolları

Kanal bağlantısı CRUD, yalnız yazılan kimlik bilgileri, konuşma/mesaj imleçli
okuma ve üyelik/davet yönetimi eklendi. Tüm yollar OpenAPI
belgesindedir; ayrıntılı alan, rol ve güvenlik sözleşmesi
[kanal/konuşma/üyelik belgesindedir](tenant-management.md).

## Kanallar ve Gelen Kutusu (Faz 7)

Ayrıntı: [Mesaj kanalları](channels.md). Genel uçlar (`/api/webhooks/...`, `/api/web-chat/...`) oturum çerezi
istemez; imza, gizli anahtar veya ziyaretçi belirteciyle korunur. Gelen Kutusu uçları
(`/api/tenants/{kiracı}/inbox/...`) oturum ve rol ister (yazma: düzenleyen ve üstü; olay akışı: izleyici dahil).
