# T-1.3 — Migrasyon, onarım ve örnek veri

Çekirdek şema `bun run db:migrate` ile gerçek PostgreSQL'e uygulanır.
Komut başarısız bağlantıyı, eksik betiği veya şema hatasını başarı saymaz;
hata metinlerine bağlantı adresi, parola veya sorgu parametresi yazılmaz.

## Komutlar

- `bun run db:generate`: Drizzle tanımlarından kaydedilen idempotent DDL'i üretir.
- `bun run db:check`: kaydedilen DDL ile kaynak şemanın uyumunu doğrular.
- `bun run db:migrate`: `ensureCoreSchema()` çağrısıyla şemayı kurar/onarar.
- `bun run db:seed`: bir örnek organizasyon, çalışma alanı, asistan ve `Talep`
  kayıt türünü idempotent ekler. Varsayılan kullanıcı veya parola oluşturmaz.

`DATABASE_URL` yoksa yerel FlowCore veritabanı kullanılır.
`POSTGRES_HOST_OVERRIDE` adresin yalnız sunucu bölümünü değiştirir; parolalar
ve URL diğer alanları korunur. Bağlantı ve sorgular süre sınırına sahiptir.
Yeni zorunlu ortam değişkeni yoktur.

## İşlem ve onarım davranışı

`ensureCoreSchema(executor)` tüm şemayı tek bağlantıya sabitlenen bir işlem
içinde ve işlem kapsamlı advisory lock ile uygular. SQL, geliştirme sırasında
Drizzle'dan üretilip kaynak olarak kaydedilir; çalışan uygulama `drizzle-kit`
bağımlılığına ihtiyaç duymaz.

Tablolar, sütunlar ve indeksler `IF NOT EXISTS` ile, anahtar/kontrol kısıtları
şema/tablo/ad kapsamlı katalog kontrolüyle kurulur. Eksik tablo, sütun,
yabancı anahtar, kontrol ve indeks tekrar oluşturulur; RLS yeniden etkinleştirilir.
İşlem içi bir hata yarım kurulumu geri alır ve sonraki çağrı yeniden denenebilir.

Mevcut bir sütunun türünü değiştirmek, veriyi dönüştürmek veya eski bir kısıtın
anlamını değiştirmek otomatik tahmin edilmez. Var olan verinin karşılamadığı
yeni zorunlu bir sütun/kısıt eklenmesi açık hata üretir; veri silinmez.
Gelecekte böyle bir değişiklik için açık veri geçişi gerekir.

DDL `public` şemasına yöneliktir; çalışma arama yolu sabitlenir. Böylece farklı
`search_path` ayarı kurulumu başka tablolara yönlendiremez. `pg_trgm` ve `vector`
eklenti kurulumları savepoint içinde denenir. Kullanılabilirlik/yetki eksikliği
durumu raporlanır ve çekirdek tabloların kurulumu sürer; eklentiyi gerektiren
özelliklerin sağlık durumu bu sonucu kullanmalıdır. Beklenmeyen SQL hatası
yutulmaz.

Örnek veri sabit UUID ve `ON CONFLICT DO NOTHING` kullanır. Tekrarlı çalıştırma
çoğaltma yapmaz, kullanıcının değiştirdiği adların üstüne yazmaz.

## Doğrulama

Otomatik testlerde PostgreSQL 17.5/PGlite üzerinde kaynak şema ile katalog
eşdeğerliği, iki kez kurulum, kayıtların korunması, eksik tablo/sütun/kısıt/indeks
onarımı, RLS, SQL hatasında geri alma ve gerçek `pg_trgm`/`vector` işlevleri
denetlenir. Örnek veri tekrarı ve özel adların korunması ayrıca sınanır.

Yerel `pgvector/pgvector:pg17` konteyneri üzerinde PostgreSQL **17.11** ile
`db:migrate` ve `db:seed` art arda ikişer kez exit 0 vermiştir. İki eklenti
etkindir; tekrar sonrası örnek organizasyon/çalışma alanı/asistan/kayıt türü
sayısı ayrı ayrı birdir. Bu konteyner FlowCore'a aittir; voiceai servisleri
değiştirilmemiştir.

Sunucu başlangıcında onarım ve hata durumunun sağlık kontrolüne yansıması API
kartında bağlanacaktır. Bu belge tek başına uygulama API'sinin hazır olduğunu
veya Faz 1'in tüm yetkilendirme kabulünün tamamlandığını ifade etmez.
