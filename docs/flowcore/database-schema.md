# T-1.1 — Çekirdek veritabanı şeması

Tarih: 2026-11-07. Kaynak: `packages/db/src/schema/`.

Bu kart Drizzle tablo tanımlarını, ilişkileri, kısıtları ve bağlantı bilgisi
şifrelemesini kapsar. Kalıcı veritabanına kurulum T-1.3, uygulama yetkilendirmesi
ve kiracı politikaları T-1.4 kapsamındadır.

T-1.2 ile bu 11 çekirdek tabloya üç [dinamik varlık tablosu](dynamic-entities.md)
eklendi. T-1.4 kimlik oturumu, T-3.10 akış/sürüm/çıktı tabloları ve T-4.2
`flow_sessions` sonrasında Faz 6'nın beş bilgi tabanı tablosuyla dışa aktarılan
şema 24 tabloya ulaştı. T-1.6 `membership_invitations` tablosuyla güncel toplam
**25 tablodur**; [üyelik/davet erişimi](tenant-management.md) ayrı belgelenmiştir.
Bilgi tabanı ilişkileri ve kapsam modeli
[bilgi tabanı belgesindedir](knowledge.md). Çalışma zamanı
oturumlarının ilişkileri ve RLS modeli [çalışma zamanı belgesindedir](runtime.md).
Aşağıdaki bölüm T-1.1 kapsamındaki tabloları açıklar; güncel erişim modeli
[kimlik doğrulama belgesindedir](authentication.md).

## Tablolar

| Tablo | Amaç ve temel kısıtlar |
|---|---|
| `tenants` | Organizasyon; saat dilimi varsayılanı `UTC`. |
| `workspaces` | Kiracıya bağlı çalışma alanı. |
| `users` | Genel kullanıcı kimliği; e-posta büyük/küçük harf ayrımı olmadan tekil. |
| `memberships` | Kullanıcı-kiracı üyeliği; çift başına tek kayıt; `owner`, `admin`, `editor`, `viewer`. Varsayılan `viewer`. |
| `agents` | Çalışma alanına bağlı asistan; `draft`, `active`, `disabled`; genel yapılandırma JSONB. |
| `channel_connections` | Kanal, sağlayıcı, dış kimlik, durum ve şifreli bağlantı bilgileri. Dış kimlik kiracı/kanal/sağlayıcı içinde tekil. |
| `contacts` | Kiracıya bağlı kişi; isteğe bağlı ad, JSONB nitelikler ve etiketler. |
| `contact_identities` | Telefon/e-posta/kanal kimliği; `(tenant_id, type, value)` tekil. Değerlerin normalleştirilmesi çağıran katmana aittir. |
| `contact_consents` | Kişi-kanal başına güncel iletişim izni; `unknown`, `granted`, `revoked`. |
| `conversations` | Kiracı, çalışma alanı, kişi ve kanal; isteğe bağlı asistan. Durum `open`, `waiting`, `closed`. |
| `messages` | Yön, işleme durumu, teslim durumu, sağlayıcı kimliği, konuşma sırası, metin ve zengin içerik. |

Her tabloda UUID kimlik ve zaman dilimli `created_at` / `updated_at` bulunur.
`updated_at` başlangıç değeri alır; sonraki güncellemelerde uygulamanın bu alanı
yenilemesi gerekir. Bu kart otomatik güncelleme tetikleyicisi oluşturmaz.

`users` genel kimlik tablosudur; kullanıcı birden fazla kiracıya üye olabilir.
`tenants` organizasyonun kendisidir. Diğer dokuz tablo `tenant_id` taşır.

## Veri bütünlüğü ve erişim temeli

- Bileşik yabancı anahtarlar, çalışma alanı, asistan, kanal, kişi ve konuşma
  ilişkilerinde başka kiracıya ait kayıtların kullanılmasını engeller.
- Konuşmanın asistanı ve kanalı aynı çalışma alanına ait olmalıdır.
- Mesaj sırası pozitif ve konuşma içinde tekildir; `provider_message_id` de
  kiracı/konuşma içinde tekildir. Henüz sağlayıcı kimliği olmayan birden fazla
  mesaj kaydedilebilir. Sıra tahsisi ve eşzamanlı işleme sonraki çalışma zamanı
  kartlarının sorumluluğundadır.
- Durum alanlarında TypeScript birleşimleri ve veritabanı `CHECK` kısıtları
  birlikte kullanılır. İlişkili kayıtlara sahip üst kayıtlar varsayılan yabancı
  anahtar davranışıyla korunur; toplu silme zinciri eklenmemiştir.
- Drizzle tanımlarında 11 tablonun tümünde RLS etkindir. Henüz izin veren
  politika bulunmadığından sıradan rollerin erişimi varsayılan olarak kapalıdır.
  Tablo sahibi/süper kullanıcı bu korumayı aşabilir; uygulama bağlantı rolü,
  kullanıcı yetkilendirmesi, politikalar ve istek başına `SET LOCAL app.tenant_id`
  T-1.4'te tamamlanacaktır. Bu kart tam uygulama izolasyonu olarak yorumlanmamalıdır.

## Bağlantı bilgilerinin şifrelenmesi

`packages/db/src/credentials.ts` içindeki `createCredentialCipher()` mevcut
`ENCRYPTION_KEY` değişkenini kullanır. Anahtar 32 bayt olmalıdır: 64 karakter hex
veya standart, dolgulu 44 karakter base64. Anahtar eksik ya da geçersizse fabrika
`null` döndürür; modül yüklemesi başarısız olmaz ve varsayılan anahtar üretilmez.
Bağlantı bilgisi kaydını sunacak katman bu durumda kaydetmeyi kapatmalıdır.

AES-256-GCM her şifrelemede rastgele 12 bayt başlangıç değeri ve 16 bayt
doğrulama etiketi kullanır. Zarf `version`, `algorithm`, `iv`, `tag`, `ciphertext`
alanlarından oluşur. Kiracı ve bağlantı kimliği ek doğrulama verisine dahil
edilir; zarf başka kiracıya veya bağlantıya taşındığında çözülemez. Yanlış
anahtar, bozulmuş veri ve bozulmuş etiket aynı sade hata mesajıyla reddedilir.

`channel_connections.credentials` alanının veritabanı kısıtı açık kimlik bilgisi
nesnelerini, eksik zarfları, ek alanları ve hatalı alan biçimlerini reddeder.
Kriptografik doğrulamayı şifre çözücü yapar. `config` alanları yalnız gizli
olmayan yapılandırmalar içindir. Anahtar değişimi mevcut kayıtların eski anahtarla
çözülüp yeni anahtarla yeniden şifrelenmesini gerektirir; bu kart anahtar dönüşüm
hizmeti veya anahtar kasası oluşturmaz.

## Doğrulama

- `drizzle-orm` 0.45.4 çalışma zamanı bağımlılığıdır.
- `drizzle-kit` 0.31.11 ve `@electric-sql/pglite` 0.3.15 yalnız geliştirme/test
  bağımlılıklarıdır. PGlite sürümü hedefle aynı PostgreSQL 17 ailesini kullandığı
  için sabitlenmiştir; test ortamında sorgulanan sürüm PostgreSQL 17.5'tir.
- Test DDL'i Drizzle şemasından üretilir ve bellekteki PostgreSQL'e uygulanır.
  Ayrı, elle yazılmış bir test şeması veya kalıcı veri değişikliği yoktur.
- Dokuz şema testi; tablolar, RLS erişim reddi, üyelikler, kimlik tekilliği,
  bileşik ilişkiler, mesaj sırası, iletişim izinleri ve şifreli zarf kısıtlarını
  sınar. Beş şifreleme testi eksik/geçersiz anahtarı, gidiş-dönüşü, rastgeleliği,
  kiracı/bağlantı kapsamını ve veri değişikliğini sınar.
- Docker servisi çalışmadığı için `pgvector/pgvector:pg17` konteynerinde test
  yapılmadı. PostgreSQL kısıtları PGlite üzerinde çalıştırıldı; pgvector/pg_trgm,
  kalıcı migration, self-healing ve faz sonu seed/RLS kabulü ilgili sonraki
  kartlarda doğrulanacaktır.

## Başvuru kaynakları

- [Drizzle şema tanımları](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle anahtarlar ve kısıtlar](https://orm.drizzle.team/docs/indexes-constraints)
- [Drizzle RLS](https://orm.drizzle.team/docs/rls)
- [PGlite başlangıç ve bellek içi kullanım](https://pglite.dev/docs/)
