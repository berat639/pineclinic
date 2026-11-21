# T-1.2 — Dinamik varlık modeli

Tarih: 2026-11-07. Kaynak: `packages/db/src/schema/entities.ts`.

Bu kart kayıt türü, bilgi alanı ve dinamik kayıtların veritabanı modelini ekler.
Tanımlar kiracı kapsamındadır; aynı kiracının farklı çalışma alanlarında
yeniden kullanılabilir. Her kayıt türü, alan ve kayıt `tenant_id` taşır.

## Üç yeni tablo

| Tablo | İçerik ve kapsam |
|---|---|
| `entity_types` | UUID, kiracı, teknik anahtar, görünen etiket, isteğe bağlı açıklama ve zaman damgaları. Anahtar kiracı içinde tekildir. |
| `field_definitions` | Kayıt türü, anahtar, etiket, alan türü, `required`, `indexed`, `semantic`, `pii`, `computed_expr`, `validation` ve isteğe bağlı referans hedefi. Anahtar kiracı/kayıt türü içinde tekildir. |
| `records` | UUID, kiracı, kayıt türü, JSONB `data`, pozitif `version`, oluşturma/güncelleme zamanları. |

Alan türleri planın belirttiği 12 değerdir: `text`, `number`, `bool`, `date`,
`time`, `datetime`, `enum`, `phone`, `email`, `money`, `json-list`, `reference`.
Alan türü TypeScript birleşimi ve veritabanı kontrolüyle sınırlandırılır.

## Bütünlük kuralları

- Kayıt türü ve alan anahtarları `^[a-z][a-z0-9_]*$` biçimindedir.
  `constructor`, `prototype` ve `__proto__` kullanılamaz. Etiketler yalnız
  boşluk, sekme veya satır sonu karakterlerinden oluşamaz.
- Alanın sahibi ve referans hedefi, bileşik yabancı anahtarlarla aynı kiracıya
  bağlanır. Kayıt başka kiracının kayıt türüne bağlanamaz.
- `reference` türünde `reference_entity_type_id` zorunludur; diğer türlerde
  bu sütun boş olmalıdır. Kendi kayıt türüne referans tanımlanabilir.
- `validation` ve `records.data` JSON nesnesidir; dizi, skaler ve JSON `null`
  değerleri reddedilir. `computed_expr` SQL `NULL` veya JSON nesnesi olabilir.
- Dört alan bayrağı varsayılan olarak `false`, doğrulama ve kayıt verisi `{}`,
  kayıt sürümü `1` değerini alır. Sürüm sıfır veya negatif olamaz.
- `records.data` üzerinde genel JSONB GIN indeksi, kiracı/kayıt türü üzerinde
  ayrı B-tree indeksi vardır. Alanın `indexed` bayrağı tek başına ayrı fiziksel
  alan indeksi oluşturmaz.
- Üç tabloda RLS etkin, izin veren politika eklenene kadar sıradan rol erişimi
  kapalıdır. Uygulama politikaları T-1.4 kapsamında tamamlanacaktır.

## Bu kartın sınırları

`required`, `semantic`, `pii`, `computed_expr` ve `validation` alanları bu kartta
metadata olarak saklanır. Kayıt verisinin alan türlerine göre doğrulanması,
zorunlu alan/enum kuralı, ifade AST doğrulaması ve çalıştırılması, anlamsal
işleme ve kişisel veri politikası henüz uygulanmaz. İfade modeli Faz 2,
üretilen doğrulayıcılar T-3.4 ve alan indekslerinin üretilmesi T-3.8 kapsamındadır.

Referans hedefi kayıt türünün kiracısını doğrular; JSONB içindeki bir değerin
gerçekten hedef türden bir kayıt kimliği olduğunu doğrulamak sonraki uygulama
katmanına aittir. `version` pozitif sürüm alanıdır; otomatik artırma veya
`WHERE version = ...` ile eşzamanlı güncelleme koruması bu kartta eklenmez.

Kalıcı migration, `ensureCoreSchema()` ve self-healing T-1.3 kapsamında kalır.
Bu kartta kalıcı veritabanı veya mevcut voiceai uygulama kodu değiştirilmez.

## Çalışma ve doğrulama düzeni

Kullanıcının isteğiyle çalışma üç alt ajana ayrıldı: şema uygulaması, PostgreSQL
testleri ve salt okunur mimari inceleme. Ana ajan sonuçları birleştirir,
repo kontrollerini çalıştırır ve belgeleri eşitler. İncelemede saptanan yalnız
sekme/satır sonundan oluşan etiket sorunu, şema kontrolü ve regresyon testiyle
düzeltildi.

Şema SQL'i testlerde Drizzle tanımlarından üretilerek PGlite içindeki PostgreSQL
17.5 üzerinde çalıştırılır. Testler kiracı/anahtar tekilliğini, bileşik
ilişkileri, referans hedeflerini, alan türlerini, varsayılanları, JSON biçimini,
sürümü, GIN indeksini ve RLS erişim reddini denetler. Son komut sonuçları
[ilerleme belgesinde](progress.md) tutulur.
