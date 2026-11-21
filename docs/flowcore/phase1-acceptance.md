# Faz 1 — Tekrarlanabilir kabul denetimi

`bun run verify:phase1` gerçek PostgreSQL ve gerçek HTTP bağlantılarıyla Faz 1'in
temel kabulünü tekrar çalıştırır. Varsayılan yerel FlowCore veritabanı bağlantısı
kullanılır; `DATABASE_URL` ve mevcut host override ayarı desteklenir. Komutu
çalıştıran bakım kullanıcısının geçici veritabanı oluşturma/silme hakkı gerekir.

Her çalıştırmada rastgele adla yeni bir veritabanı oluşturulur. Mevcut uygulama
veritabanı veya şema sıfırlanmaz. Başarısız denemede de sunucu, bağlantılar ve
bu çalıştırmanın geçici veritabanı temizlenir.

Denetim sırası:

1. Çekirdek şema, kiracı erişimi ve örnek veri iki kez kurulur.
2. `pg_trgm` ve `vector` eklentilerinin etkinliği ve örnek kayıtların tekilliği
   denetlenir.
3. Geçici portta Bun/Hono sunucusu açılır; health ve OpenAPI çağrıları yapılır.
4. İki bağımsız kullanıcı ve organizasyon kaydedilir; çerez korumaları ve
   yanıtta ham oturum anahtarının olmaması denetlenir.
5. Dinamik Talep türü ve kayıt oluşturulur; güncel sürümle yazma başarılı,
   eski sürümle yazma 409 olmalıdır.
6. Diğer organizasyonun yolu 403 üretmelidir. Paralel, filtresiz SQL okumaları
   veritabanı politikalarıyla yalnız kendi kiracısının kayıtlarını görmelidir.
7. Çıkıştan sonra aynı çerezle oturum sorgusu 401 üretmelidir.

2026-11-07 tarihinde bu komut yerel PostgreSQL 17.11 üzerinde exit 0 verdi.
Bu kabul, planın sonraki fazlarındaki tüm kanallar üzerinden rezervasyon,
gerçek ses görüşmesi, üretim dağıtımı ve tarayıcı/cihaz kapılarını tamamlamaz.
