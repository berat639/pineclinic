# Project Guidelines & Rules

## UI & Design Rules
1. **Glassmorphism Kesinlikle Yasaktır**:
   - Cam efekti (`backdrop-filter: blur`), yarı saydam sisli/cam arka planlar (`rgba(255,255,255,0.03)` vb.) KESİNLİKLE KULLANILMAYACAKTIR.
2. **Düz, Opak ve Yüksek Kontrastlı Tasarım (Solid Flat Architecture)**:
   - Tüm kartlar, modallar, popoverlar ve paneller opak, net ve düz (solid) arka planlara sahip olmalıdır (Dark mod için `#1e293b` / `#0f172a`, Light mod için `#ffffff`).
   - Kontrastlar yüksek olmalı, koyu tema üzerinde koyu mavi gibi okunaksız renkler yerine net beyaz (`#ffffff`) veya açık gri (`#e2e8f0` / `#94a3b8`) kullanılmalıdır.
   - Girdi alanları (`input`, `select`) net sınır çizgilerine (`#334155`) ve solid arka planlara sahip olmalıdır.
3. **Zorunlu Çift Tema Desteği (Light & Dark Theme Uyumu - KESİNLİKLE SABİT RENK KULLANILMAZ)**:
   - Bileşenlerde SADECE Dark moda göre sabit renk kodları (`background: '#1e293b'`, `background: '#0f172a'`, `color: '#ffffff'`, `border: '#334155'`) YAZMAK KESİNLİKLE YASAKTIR.
   - Tüm kartlar, modallar, popoverlar, context menüler, butonlar, inputlar ve bildirim kutuları HEM AÇIK (LIGHT) HEM DE KOYU (DARK) temada kusursuz görünmelidir.
   - Renkler her zaman temaya duyarlı CSS değişkenleri (`var(--card-bg)`, `var(--input-bg)`, `var(--input-border)`, `var(--foreground)`, `var(--foreground-2)`, `var(--foreground-3)`, `var(--glass-border)`, `var(--card-inner)`, `var(--accent)`, `var(--danger)` vb.) veya `[data-theme="light"]` / `[data-theme="dark"]` seçicileri ile tanımlanmalıdır.
   - Açık temada siyah/koyu arka planlı yamaların kalması veya açık temada beyaz/açık yazıların okunaksızlaşması kesinlikle kabul edilemez.
4. **Klinik & Sağlık Renk Mimarisi ve Buton Standartları (Medical Clean Design)**:
   - **Klinik / Sağlık Kimliği:** Bu bir medikal ve klinik yönetim sistemidir. Renk dili her zaman sağlık, ferahlık, güven, hijyen ve profesyonellik hissettirmelidir. Ana renk paleti **Sağlık Mavisi (Medikal Mavi), Açık Mavi, Buz Mavisi, Nane Yeşili ve Opak Beyaz**'dır.
   - **Açık (Light) Mod Buton Kuralları (KESİNLİKLE SİYAH/KOYU BUTON KULLANILMAZ):**
     - Light modda butonların siyah, antrasit, koyu gri veya koyu lacivert kutu zeminli olması KESİNLİKLE YASAKTIR. Açık ekranda siyah kutulu buton yer alamaz.
     - Birincil Butonlar (Primary): Canlı medikal mavi (`#0284c7`, `#2563eb`), beyaz yazı (`#ffffff`).
     - İkincil / İşlem Butonları (Secondary/Outline): Temiz beyaz veya çok açık buz mavisi zemin (`#ffffff` / `#eff6ff`), medikal mavi sınır (`#93c5fd` / `#3b82f6`), medikal mavi metin (`#0284c7` / `#1d4ed8`).
     - Pozitif / Eylem Butonları (Excel, İçe Aktar vb.): Ferah nane zemin (`#f0fdf4`), nane yeşili sınır (`#86efac`), sağlık yeşili metin (`#15803d`).
     - Rozetler ve Sayaçlar (Badges/Pills): Açık gök mavisi zemin (`#e0f2fe`), medikal mavi sınır (`#bae6fd`), koyu medikal mavi metin (`#0369a1`).
   - **Koyu (Dark) Mod Buton ve Renk Kuralları (Sağlığı Çağrıştıran Medikal Gece Mavisi):**
     - Koyu modda kasvetli, ölü siyah veya çamurlu renkler yerine; sağlığı ve modern medikal teknolojiyi çağrıştıran derin klinik gece mavisi (`#0b1329`, `#0f172a`, `#132238`), canlı sağlık mavisi (`#38bdf8`, `#60a5fa`) ve nane yeşili (`#34d399`) vurgular kullanılmalıdır.
     - İkincil butonlar derin klinik mavi zemin (`#132238`), medikal mavi sınır (`#1e40af`) ve parlak mavi metin (`#60a5fa`) ile şık ve sağlık odaklı olmalıdır.


## Project Isolation Rules
1. **gemini-live-test Bağımsızlığı**:
   - `gemini-live-test` klasörü tamamen ayrı ve bağımsız bir projedir. `voiceai` ile paralel geliştirilmemelidir.
   - Bu klasördeki dosyalar üzerinde işlem yaparken `voiceai` projesi bağlamı (context) dahil EDİLMEMELİDİR.

## Software Architecture & Code Quality Rules
1. **Modern ve Gelişmiş Tasarım Desenleri (Design Patterns)**:
   - Yazılım mimarisi her zaman en güncel, yüksek performanslı ve ölçeklenebilir pattern'ler kullanılarak inşa edilmelidir (örn. asenkron yapılar, event-driven architecture, modüler ve decoupled bileşenler).
2. **Temiz Kod (Clean Code) ve Hatasızlık**:
   - Spagetti kod yazılmamalıdır. Kod her zaman SOLID prensiplerine, DRY (Don't Repeat Yourself) ve KISS (Keep It Simple, Stupid) kurallarına uygun olmalıdır.
   - Yapılan her değişiklikte, mevcut sistemin kırılmamasına azami özen gösterilmeli, hata payı sıfıra indirilmelidir.
3. **Şeffaf Tasarım Kesinlikle Yasaktır (Tekrar)**:
   - UI tarafında şeffaf (transparent), yarı saydam veya cam efekti içeren HİÇBİR tasarıma yer verilmemelidir. Arayüz elemanları daima opak ve net hatlara (solid) sahip olmalıdır.

## Backend, Migration, Docker & .env Güvenlik Kuralları
1. **Docker & Dokploy Ortam Uyumu (Sıfır Çökme / Zero-Downtime)**:
   - `docker-entrypoint.sh` dosyası `set -e` ile çalıştığı için, migration (`migrate.ts`), seed (`migrate-seed.ts`) veya kullanıcı oluşturma (`seed-users.ts`) adımlarında yaşanacak tek bir hata tüm Docker container'ının çökmesine (crashloop) neden olur. Bu nedenle bu scriptlerdeki tüm adımlar %100 hatasız ve idempotent olmak zorundadır.
   - Yeni eklenen hiçbir backend veya frontend özelliği ZORUNLU yeni bir `.env` değişkeni gerektirmemelidir. Tüm yeni konfigürasyonlar güvenli varsayılan değerlere (`process.env.VAR || 'default'`) sahip olmalıdır. Dokploy üzerindeki mevcut container'lar yeni `.env` girilmeden de hatasız ayağa kalkmalıdır.
   - Asla `process.env.VAR!` şeklinde runtime'da undefined olduğunda uygulamayı çökertecek assertion'lar kullanılmamalıdır. Sayısal ve boolean dönüşümler (`Number(process.env.PORT) || 3001`, `process.env.ENABLE_X === 'true'`) güvenli parse edilmelidir.
   - `docker-compose.dokploy.yml`, `server/Dockerfile`, `client/Dockerfile` ve `server/docker-entrypoint.sh` yapısı bozulmamalıdır. Dokploy'a özgü DNS override (`POSTGRES_HOST_OVERRIDE`, `REDIS_HOST_OVERRIDE`) mekanizması korunmalıdır.
   - Yeni opsiyonel çevre değişkenleri her zaman `.env.example` içerisine açıklayıcı yorumlarla eklenmelidir.
   - Frontend derlemesinde (`client/Dockerfile`) `NEXT_PUBLIC_*` değişkenlerinin eksikliği durumunda build'in patlamaması için kod içinde fallback (`process.env.NEXT_PUBLIC_API_URL || ''`) tanımlanmalıdır.

2. **İdempotent ve Kendi Kendini Onaran (Self-Healing) Veritabanı Migrasyonu**:
   - Tüm veritabanı şema ve tablo değişiklikleri kesinlikle İDEMPOTENT olmalıdır (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`). Migration komutu (`server/src/db/migrate.ts`) arka arkaya defalarca çalıştırılsa bile hata vermemeli, başarıyla tamamlanmalıdır (`Exit code: 0`).
   - Seed scriptlerinde (`migrate-seed.ts`, `seed-users.ts`) mükerrer kayıt hatalarını önlemek için mutlaka `ON CONFLICT DO NOTHING` veya idempotent upsert yapısı kullanılmalıdır.
   - Yeni eklenen kritik tablolar için sunucu başlangıcında self-healing (örn. `ensureXTable()`) fonksiyonu bulunmalı, migration komutu atlanmış veya gecikmiş olsa dahi container çökmeden ve 500 hatası vermeden eksik tabloyu otomatik oluşturabilmelidir.
   - Geriye dönük uyumluluk (backward compatibility) bozulmamalıdır; var olan veri ve kolonlar dikkatsizce silinmemeli (`DROP COLUMN`), transaction bütünlüğü ve Foreign Key kısıtlamaları daima korunmalıdır.

3. **Dağıtım Öncesi Yerel Doğrulama Zorunluluğu (Pre-Deployment Checklist)**:
   - Push ve deploy öncesinde aşağıdaki adımların lokalde hatasız tamamlandığı (`Exit code: 0`) mutlaka doğrulanmalıdır:
     - `bun run server/src/db/migrate.ts`
     - `bun run server/src/scripts/migrate-seed.ts`
     - `bun run server/src/scripts/seed-users.ts`
   - Hem sunucu hem istemci tarafında TypeScript derlemesi yapılarak 0 hata olduğu teyit edilmelidir:
     - `cd server && bun x tsc --noEmit`
     - `cd client && bun x tsc --noEmit`

