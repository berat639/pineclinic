# T-1.4 — Kimlik doğrulama ve kiracı erişimi

Kullanıcı kaydı, giriş ve çıkış `createAuthService()` üzerinden yürütülür.
Kayıt tek işlemde genel kullanıcıyı, organizasyonu, çalışma alanını, sahip
üyeliğini ve oturumu oluşturur. E-posta kırpılıp küçük harfe çevrilir;
parolalar Argon2id ile özetlenir. Yinelenen e-posta ek organizasyon bırakmaz.

Oturum anahtarı 32 rastgele bayttır; veritabanında yalnız SHA-256 özeti
saklanır. `auth_sessions` genel kullanıcıya bağlıdır ve uygulamanın kiracı
rolüne açılmaz. Süresi dolmuş veya çıkışla iptal edilmiş anahtar kullanılamaz.
`SESSION_TTL_HOURS` mevcut opsiyonel ayardır; geçersiz değerde 168 saat kullanılır.

## HTTP sınırı

- `POST /api/auth/register`: kullanıcı ve organizasyon kaydı.
- `POST /api/auth/login`: yeni oturum açma.
- `GET /api/auth/me`: mevcut kullanıcı ve güncel üyelikleri.
- `POST /api/auth/logout`: oturumu iptal etme ve çerezi silme.

Oturum anahtarı yanıt JSON'unda gösterilmez. Çerez `HttpOnly`, `SameSite=Lax`,
`Path=/` ve HTTPS/üretimde `Secure` kullanır. Güvenli olmayan metotlarda farklı
`Origin` ve `Sec-Fetch-Site: cross-site` istekleri reddedilir. Çerez adı mevcut
opsiyonel ayardan alınır; geçersiz ad güvenli varsayılana döner. Hatalar Türkçe
mesaj, sabit destek sınıfı ve rastgele destek koduyla döner; SQL, parola,
bağlantı adresi ve oturum anahtarı hatalara eklenmez.

## Veritabanı erişim modeli

Bakım bağlantısı şema, üyelik doğrulama ve kimlik işlemleri için kullanılır.
`withTenant(executor,{tenantId,userId},callback)` kullanıcı kimliğini doğrulanmış
oturumdan almalıdır; dışarıdan verilen kullanıcı kimliği güvenilir sayılmaz.
Üyelik ve rol veritabanından okunur, istek gövdesindeki rol dikkate alınmaz.

Kiracı işlemi aynı bağlantıda `SET LOCAL ROLE flowcore_app` ve işlem kapsamlı
`app.tenant_id` / `app.user_id` değerlerini kullanır. Arama yolu katalog öncelikli
olarak sabitlenir. İşlem bitişi/geri alma başka isteğe rol veya kiracı taşımaz.
Bu yardımcı güvenilir sunucu SQL'i içindir; kullanıcı SQL'i çalıştıran sandbox
değildir. Rol değiştirilebilen bakım bağlantısı son kullanıcıya verilmez.

`ensureTenantAccess()` oturum açamayan ve RLS atlayamayan sabit uygulama rolünü
kurar; mevcut rolün tehlikeli hak veya sahiplik taşıması açık hatadır. Kiracı
tablolarına yalnız bu role yönelik politikalar eklenir. Kısıtlayıcı eş politika,
başka bir genel izin politikası eklense bile kiracı koşulunun atlanmasını engeller.
Genel kullanıcı tablosunda yalnız kişinin kendi kaydı ve güvenli sütunlar okunur;
parola özeti ve oturum tablosu bu role kapalıdır.

Veritabanı politikaları kiracı sınırını korur. İşlem yetkisi ayrıca sunucu
katmanında `requireRole()` ile denetlenir: görüntüleyici yazamaz, alan/kayıt türü
ve yönetim değişiklikleri sahip/yönetici yetkisi gerektirir. Üyelik tablosu genel
CRUD arayüzüne açılmaz.

## Başlangıç ve kabul

Migrasyon komutu şemadan sonra kiracı rol/politikalarını da kurar. API sunucusu
aynı onarımı başlangıçta dener; hata süreci çökertmek yerine sağlık durumunu
503 yapar ve 15 saniyede bir yeniden dener. Tamamlanmadan API işlemleri kapalıdır.
`/health` ayrıca gerçek bağlantıya `SELECT 1` sorgusu gönderir. OpenAPI
`/openapi.json` üzerinden sunulur.

Parola/oturum, kötü giriş, atomiklik, süre sonu/çıkış, kiracılar arası ham sorgu,
rol türetme, bağlam temizliği, sınırlı sütun yetkisi ve HTTP çerez/origin davranışı
otomatik testlerle doğrulanır. Son komut kanıtları `progress.md` içindedir.

Kaynaklar: [Bun parola özetleme](https://bun.sh/docs/runtime/hashing),
[Hono OpenAPI](https://hono.dev/examples/zod-openapi),
[Hono çerez yardımcıları](https://hono.dev/docs/helpers/cookie).
