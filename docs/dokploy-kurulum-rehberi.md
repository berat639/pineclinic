# VoiceAI — Docker ve Dokploy Kurulum Rehberi

Bu rehber, VoiceAI'nin tek bir Linux sunucusunda, tek bir Dokploy projesi altında frontend, backend, PostgreSQL, Redis, Asterisk ve DentalSegmentator ile kurulmasını anlatır. WhatsApp için ayrı Evolution API kurulumu ve Google Calendar bağlantısı da kapsamdadır.

**İnceleme tarihi:** 16 Ekim 2026. **Kaynak sürüm:** `7947108c`. Bu belge kaynak kodu ve yapılandırmalar incelenerek hazırlanmıştır; burada anlatılan dağıtım canlı sunucuda uygulanmamıştır. Aşağıdaki düzeltme örnekleri de uygulama dosyalarına otomatik uygulanmış değildir.

`gemini-live-test/` bağımsız projedir ve bu rehberin kapsamı dışındadır. Bütün örnek domainler ve `DEGISTIR_...` değerleri yer tutucudur. Gerçek `.env` değerleri bu belgeye alınmamıştır.

## İçindekiler

1. [Mimari ve proje haritası](#1-mimari-ve-proje-haritasi)
2. [Kurulumdan önce giderilecek eksikler](#2-kurulumdan-once-giderilecek-eksikler)
3. [Sunucu, DNS ve ağ hazırlığı](#3-sunucu-dns-ve-ag-hazirligi)
4. [Dokploy kurulumu](#4-dokploy-kurulumu)
5. [Git deposu ve build hazırlığı](#5-git-deposu-ve-build-hazirligi)
6. [Production ortam değişkenleri](#6-production-ortam-degiskenleri)
7. [Compose düzeltmeleri ve kalıcı diskler](#7-compose-duzeltmeleri-ve-kalici-diskler)
8. [Dokploy projesini oluşturma ve deploy](#8-dokploy-projesini-olusturma-ve-deploy)
9. [Domain, HTTPS ve proxy](#9-domain-https-ve-proxy)
10. [PostgreSQL, Redis ve ilk yönetici](#10-postgresql-redis-ve-ilk-yonetici)
11. [Frontend ve backend doğrulaması](#11-frontend-ve-backend-dogrulamasi)
12. [Gemini, RAG ve Google Calendar](#12-gemini-rag-ve-google-calendar)
13. [Asterisk ve Netgsm](#13-asterisk-ve-netgsm)
14. [DentalSegmentator ve DICOM](#14-dentalsegmentator-ve-dicom)
15. [Evolution API, WhatsApp, SMS ve e-posta](#15-evolution-api-whatsapp-sms-ve-e-posta)
16. [Frontend, backend ve altyapıyı ayrı servisler olarak kurma](#16-ayri-servisler-olarak-kurma)
17. [Yedekleme ve geri yükleme](#17-yedekleme-ve-geri-yukleme)
18. [Güncelleme, geri dönüş ve kesinti yönetimi](#18-guncelleme-geri-donus-ve-kesinti-yonetimi)
19. [Sorun giderme](#19-sorun-giderme)
20. [Kabul kontrol listesi ve kaynaklar](#20-kabul-kontrol-listesi-ve-kaynaklar)

<a id="1-mimari-ve-proje-haritasi"></a>
## 1. Mimari ve proje haritası

Önerilen başlangıç topolojisi: **bir Dokploy Docker Compose uygulaması, tek backend instance'ı**. Depodaki `docker-compose.dokploy.yml` bunun temelidir. Dokploy'un kendi PostgreSQL/Redis servisleri VoiceAI veritabanı yerine kullanılmaz.

```mermaid
flowchart LR
    Browser[Tarayıcı] -->|HTTPS 443| Traefik[Dokploy / Traefik]
    Traefik -->|klinik.example.com| Client[Next.js :3002]
    Traefik -->|api.example.com| Server[Bun / Elysia :3001]
    Client -->|HTTP, imzalı klinik hostname| Server
    Server --> PG[(PostgreSQL 16 + pgvector)]
    Server --> Redis[(Redis 7 / BullMQ)]
    Server --> Gemini[Google Gemini]
    Client --> Dental[DentalSegmentator :8000]
    Netgsm[Netgsm SIP / RTP] --> Asterisk[Asterisk :5060]
    Asterisk -->|AudioSocket TCP 12000| Server
    Server -->|AMI TCP 5038| Asterisk
    Server <--> Evolution[Opsiyonel Evolution API]
    Server <--> Calendar[Opsiyonel Google Calendar]
```

**Ses akışı ayrımı:** Yukarıdaki şema sunucu üzerinden çalışan akışları gösterir. Mevcut ana sayfa `HomeClient` ayrıca `/api/direct-session` üzerinden anahtar alıp tarayıcıdan doğrudan Google'a bağlanır. Bu akışın canlıya çıkış engeli Bölüm 2'de açıklanmıştır. Backend `/ws` yolu ile telefon AudioSocket yolu ayrı akışlardır.

| Dizin / dosya | Görev | Kurulumdaki karşılığı |
|---|---|---|
| `package.json` | Bun workspace, `server` ve `client` | Backend build kök manifesti |
| `server/` | Elysia HTTP/WS, auth, klinikler, randevular, RAG, ses, WhatsApp | `server/Dockerfile`, HTTP 3001 |
| `server/src/db/` | PostgreSQL şeması, migration, repository'ler, Redis | pgvector gerekli |
| `server/src/queue/`, `server/src/cron/` | Kuyruklar ve hatırlatıcılar | Backend işlemi içinde çalışır; ayrı worker servisi tanımlı değil |
| `client/` | Next.js 15, React 19, panel, takvim, DICOM/CBCT | `client/Dockerfile`, standalone Node 20, port 3002 |
| `infra/asterisk/` | SIP, RTP, dialplan, AMI, AGI | Netgsm telefon köprüsü |
| `services/dental-segmentator/` | FastAPI, SimpleITK, PyTorch/nnU-Net | CPU image, port 8000 |
| `data/` | Seed JSON dosyaları ve görüşme WAV kayıtları | `/app/data` volume |
| `server/public/uploads/` | Klinik logoları ve yüklenen DICOM dosyaları | Ayrıca kalıcı volume gerekir |
| `server/public/tenant-assets/` | Kliniğe özel logo/branding dosyaları | Kalıcı volume veya DB'den yeniden üretim |
| `docker-compose.dokploy.yml` | Altı servisin Dokploy topolojisi | Production başlangıç dosyası |
| `docker-compose.yml` | Yerel geliştirme; host portları açık | Production dosyası yerine kullanılmaz |
| `docker-compose.asterisk.yml` | Belirli bir eski kuruluma özel Asterisk | Genel kurulum şablonu değildir |

### Servis, port ve kaynak tablosu

| Servis | Image / build | Container portu | Dış yayın | Mevcut RAM / CPU limiti |
|---|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | 5432/TCP | Yok | 1 GB / 1 CPU |
| `redis` | `redis:7-alpine` | 6379/TCP | Yok | 256 MB / 0.5 CPU |
| `server` | Kök context + `server/Dockerfile` | 3001/TCP, 12000/TCP | HTTP, Traefik üzerinden | 512 MB / 1 CPU |
| `client` | Kök context + `client/Dockerfile` | 3002/TCP | HTTP, Traefik üzerinden | 256 MB / 0.5 CPU |
| `dental-segmentator` | Kök context + servis Dockerfile'ı | 8000/TCP | Yok | 4 GB / 2 CPU |
| `asterisk` | `infra/asterisk` context | 5060/TCP+UDP, RTP, 5038/TCP | SIP/RTP doğrudan host | 512 MB / 1 CPU |

Bu değerler kapasite garantisi değildir. Özellikle DICOM upload sırasında Next.js ve backend bellek tüketimi artar; mevcut 256/512 MB limitler büyük hacimlerde yetersiz kalabilir. Başlangıçta izleyerek client/backend için 1–2 GB aralığını değerlendirin. Full nnU-Net için 4 GB dental limiti yeterli kabul edilmemelidir.

<a id="2-kurulumdan-once-giderilecek-eksikler"></a>
## 2. Kurulumdan önce giderilecek eksikler

Mevcut dosyalar bir dağıtım iskeleti sağlar; aşağıdaki bulgular giderilmeden kurulumu tamamlanmış saymayın.

| Bulgu | Etkisi | Yapılacak işlem |
|---|---|---|
| Backend Dockerfile `bun.lock*` ve `--frozen-lockfile` kullanıyor; incelenen Git sürümünde kök lockfile takip edilmiyor | Temiz checkout build'i tekrarlanabilir değil; frozen install başarısız olabilir | Bölüm 5: uyumlu lockfile üretin ve release'e dahil edin |
| Kök `.dockerignore` bulunmuyor | Kök context yerel bağımlılıkları, env dosyalarını ve verileri taşıyabilir | Bölüm 5'teki kapsamı uygulayın |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `DEFAULT_CLINIC_NAME` ana Compose'da server'a aktarılmıyor | Dokploy Environment'a yazılsa bile seed varsayılan hesapla çalışır | Bölüm 7: açık environment eşlemesi ekleyin |
| `/app/server/public/uploads` ve `tenant-assets` volume'a bağlı değil | Container yeniden yaratılınca dosyalar kaybolabilir; bazı logolar DB'den üretilebilir | Bölüm 7: dosya volume'larını ekleyin; eski veriyi önce taşıyın |
| `NEXT_PUBLIC_API_URL` Dockerfile'da var, Compose build arg listesinde yok | Bazı takvim/DICOM istekleri kullanıcının `localhost:3001` adresine gidebilir | Bölüm 7: aynı origin frontend URL'sini build arg olarak verin |
| Asterisk'e `ASTERISK_AMI_SECRET` aktarılmıyor | Backend'deki özel AMI parolası Asterisk ile eşleşmez | Bölüm 7 ve 13: aynı değişkeni Asterisk'e de aktarın |
| Dokploy Compose'da Asterisk ve dental için `profiles` yok | `TELEPHONY_ENABLED=0`, Asterisk container'ını kapatmaz | Tam kurulumda SIP bilgilerini doldurun; kısmi kurulum için açık profile düzenlemesi yapın |
| `/api/direct-session` kimlik kontrolü olmadan `GEMINI_API_KEY` döndürüyor; client Compose anahtarı alıyor | Public frontend kalıcı Gemini anahtarını açığa çıkarır | Public yayın öncesi bu yolu kapatın veya kısa ömürlü yetkilendirmeye taşıyın; yalnız login eklemek kalıcı anahtarı tarayıcıya verme sorununu çözmez |
| `/api/ai/parse` route'unda uygulama içi kimlik kontrolü yok | Public erişim ücretli AI çağrılarını tetikleyebilir | Oturum/rol kontrolü ve kullanım sınırı ekleyin veya özelliği erişime kapatın |
| Backend proxy fallback listesinde eski kuruluma ait public domain/servis adları var | Yerel backend erişilemeyince istekler yanlış ortama yönlenebilir | Yeni ortamda fallback listesini yalnız bu kuruluma ait adreslerle sınırlandırın |
| `migrate.ts` eski `doctors` tablosuna `DROP TABLE IF EXISTS ... CASCADE` uygular | Eski bir DB üzerinde veri kaybı riski | Eski DB'yi doğrudan bağlamadan önce yedek ve izole migration provası yapın |
| Dental README otomatik model indirmeden söz ediyor; Docker CMD yalnız Uvicorn başlatıyor | Full mod model olmadan 503 üretir | Bölüm 14: modeli açıkça indirin |
| `docker-compose.asterisk.yml` sabit sunucu bilgileri ve düz metin SIP parolası içeriyor | Başka sunucuya yanlış bağlantı ve credential yayılımı | Bu dosyayı yeni kurulumda kullanmayın; ilgili anahtarları yenileyip env üzerinden yönetin |

Bu çalışma yalnız dokümantasyondur; tabloda tarif edilen kod değişiklikleri tamamlanmış değildir. Geçici olarak client'tan `GEMINI_API_KEY` kaldırmak anahtar döndürülmesini önler, ancak ana sayfadaki doğrudan ses akışını ve AI parse özelliğini devre dışı bırakır. Bu, bütün özellikleri çalışan bir çözüm olarak kabul edilmemelidir.

Paylaşılmış veya kaynak dosyada tutulmuş gerçek kimlik bilgilerini yeni kuruluma taşımadan önce sağlayıcılarında yenileyin. `INTEGRATION_ENCRYPTION_KEY` için farklı davranın: mevcut veritabanındaki şifrelenmiş entegrasyonları açabilmek için mevcut anahtarı koruyun; anahtar yenilenecekse kayıtların yeniden şifrelenmesini veya yeniden girilmesini planlayın.

<a id="3-sunucu-dns-ve-ag-hazirligi"></a>
## 3. Sunucu, DNS ve ağ hazırlığı

### 3.1 Sunucu kapasitesi

Linux üzerinde Ubuntu 24.04 LTS veya Debian 12 kullanılabilir. Aşağıdaki VoiceAI kapasite değerleri planlama önerisidir; yük testi sonucu değildir:

| Kullanım | Başlangıç planı |
|---|---|
| Panel + backend + PostgreSQL + Redis | 4 vCPU, 8 GB RAM, 80–100 GB SSD |
| Asterisk + dental fast + build işlemleri dahil | 8 vCPU, 16 GB RAM, en az 150 GB SSD |
| Dental full CPU | 32 GB ve üzeri RAM bütçesi; gerçek CBCT ile kapasite testi |
| Dental full GPU | Ayrı GPU image/runtime çalışması gerekir; mevcut Dockerfile CPU PyTorch kurar |

Build sırasında Next.js, Python/PyTorch indirmeleri ve Docker image katmanları için ek disk/RAM gerekir. Görüşme kayıtları ve DICOM depolaması için kullanım hacmine göre ayrıca alan ayırın. Depolama büyümesi için otomatik silme politikasının mevcut olduğunu varsaymayın.

### 3.2 Domain planı

| Örnek domain | Hedef |
|---|---|
| `deploy.example.com` | Dokploy yönetim arayüzü |
| `klinik.example.com` | VoiceAI frontend |
| `api.example.com` | VoiceAI backend, callback ve webhook |
| `whatsapp.example.com` | Opsiyonel Evolution API |

Domainlerin A kayıtlarını VPS public IPv4 adresine yönlendirin. AAAA kaydı varsa IPv6 erişiminin de çalıştığını doğrulayın. İlk kurulumda doğrudan DNS yönlendirmesi kullanmak proxy kaynaklı hata ayıklamayı azaltır.

```bash
dig +short A klinik.example.com
dig +short A api.example.com
dig +short AAAA klinik.example.com
```

### 3.3 Port planı

| Port | Erişim |
|---|---|
| SSH portunuz, çoğunlukla 22/TCP | Yönetici IP/VPN |
| 80/TCP, 443/TCP | Public; Traefik ve HTTPS |
| 3000/TCP | Dokploy ilk kurulum; sonrasında yönetici erişimiyle sınırlandırın |
| 5060/TCP ve gerekliyse 5060/UDP | Netgsm SIP; sağlayıcının doğrulanmış IP aralıkları |
| 10000–10200/UDP | RTP; Netgsm medya IP'leri ve trunk gereksinimleri |
| 5432, 6379, 3001, 3002, 8000/TCP | Public açmayın; Docker iç ağı |
| 5038/TCP | Yalnız backend → Asterisk AMI |
| 12000/TCP | Yalnız Asterisk → backend AudioSocket |

Cloud firewall ile host firewall kurallarını birlikte değerlendirin. Docker tarafından publish edilen portlar için yalnız UFW ekranına bakarak erişimin kapalı olduğunu varsaymayın. Bu rehber tek sunucu içindir; çok düğümlü Swarm portlarını public açmak gerekmiyor.

Çıkış yönünde DNS, HTTPS, image/package registry'leri, Google servisleri, model indirmesi için Zenodo ve kullanılan Netgsm/SMTP servisleri erişilebilir olmalıdır.

<a id="4-dokploy-kurulumu"></a>
## 4. Dokploy kurulumu

Zaten çalışan bir Dokploy varsa yeniden kurulum yapmadan Bölüm 5'e geçin. Yeni Linux sunucusunda 80, 443 ve 3000 portlarının boş olduğunu kontrol edin. Dokploy installer Docker'ı da kurabilir. Resmî başlangıç komutu aşağıdadır. [Dokploy kurulum belgesi](https://docs.dokploy.com/docs/core/installation).

```bash
# Yeni Linux sunucusunda root yetkisiyle:
ss -lntup
curl -sSL https://dokploy.com/install.sh -o /root/dokploy-install.sh
less /root/dokploy-install.sh
sh /root/dokploy-install.sh

docker version
docker compose version
docker service ls
docker network inspect dokploy-network
```

1. `http://SUNUCU_IP:3000` adresini açın ve ilk Dokploy yöneticisini oluşturun.
2. Dokploy ayarlarından `deploy.example.com` ve HTTPS erişimini yapılandırın.
3. Git sağlayıcısını veya salt okunur repository deploy key'ini bağlayın.
4. Çalıştırılacak sunucuyu ve disk kapasitesini doğrulayın.
5. Kurulan Dokploy sürümünü operasyon kaydına yazın. Arayüzdeki alan adları sürüme göre küçük farklılıklar gösterebilir.

Depodaki Compose dış `dokploy-network` ağını bekler. Ağ bulunmuyorsa rastgele yeni bir bridge ağ oluşturarak hatayı örtmeyin; doğru Dokploy sunucusunda olduğunuzu ve Dokploy kurulumunun tamamlandığını doğrulayın.

<a id="5-git-deposu-ve-build-hazirligi"></a>
## 5. Git deposu ve build hazırlığı

### 5.1 Build context

Her iki uygulama image'ı **repository kökünden** build edilir:

Önce Bölüm 5.2–5.4 hazırlıklarını tamamlayın; aşağıdaki örnek build komutlarını daha sonra çalıştırın.

```bash
# Repository kökünde; bu komutlar image build eder, deploy etmez.
docker build -f server/Dockerfile -t voiceai-server:RELEASE .
docker build -f client/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://klinik.example.com \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_WS_URL=wss://api.example.com/ws \
  --build-arg SERVER_URL=http://voiceai-server:3001 \
  --build-arg BACKEND_PROXY_URL=http://voiceai-server:3001 \
  -t voiceai-client:RELEASE .
```

Backend build `package.json`, kök Bun lockfile'ı, iki workspace manifesti ve `data/` dizinini kullanır. `cd server && docker build .` mevcut Dockerfile ile doğru işlem değildir.

### 5.2 Lockfile ve build tekrarlanabilirliği

İncelenen sürümde `git ls-files bun.lock bun.lockb` çıktı vermiyor. `.gitignore` Bun lockfile'ını hariç tutarken backend Dockerfile frozen install bekliyor.

```bash
git ls-files bun.lock bun.lockb
git ls-files data/knowledge.json data/recordings.json data/recordings/.gitkeep
```

Release hazırlığında:

1. Kullanılacak Bun sürümünü Docker build ile aynı sürüme sabitleyin veya uyumluluğunu doğrulayın.
2. Kök workspace'te `bun install --lockfile-only` ile lockfile üretin.
3. `.gitignore` kuralını düzeltin ve lockfile'ı release commit'ine dahil edin.
4. Temiz checkout üzerinde backend build'in frozen install adımını doğrulayın.
5. Frontend Dockerfile bağımsız `bun install` kullanıyor; kök lockfile'ın eklenmesi frontend build'ini kendiliğinden sabitlemez. Tekrarlanabilir frontend build için kendi install akışını ayrıca düzenleyin.

`data/` dizini `.gitignore` içinde olsa da listelenen seed dosyaları mevcut Git sürümünde takip ediliyor. Temiz checkout'ta bunları doğrulayın; çalışan ortamın hasta/kayıt verisini image içine kopyalamayın.

### 5.3 Kök `.dockerignore`

`server/.dockerignore` ve `client/.dockerignore`, `context: .` kullanılan build'lerde kök ignore dosyasının yerini tutmaz. Kök `.dockerignore` veya `server/Dockerfile.dockerignore` gibi Dockerfile'a özgü doğru isim kullanılmalıdır. [Docker build context belgesi](https://docs.docker.com/build/concepts/context/).

Kök için değerlendirilmesi gereken başlangıç içeriği:

```dockerignore
.git
.agents
.codex
**/node_modules
**/.next
**/dist
**/__pycache__
**/.venv
**/.env
**/.env.*
**/*.log
temp
gemini-live-test
server/public/uploads
server/public/tenant-assets
data/recordings/*
!data/recordings/.gitkeep
```

Kök `package.json`, lockfile, `client/public`, servis kaynakları ve gerekli seed JSON dosyalarını hariç tutmayın. Yalnız `client/.env` silen mevcut Dockerfile komutu `.env.local` ve `.env.production.local` gibi dosyaların build'e etkisini engellemez.

### 5.4 Projenin dağıtım öncesi kontrolleri

Bu komutlar yalnız **yerel test veritabanına** bağlanan `.env` ile, repository kökünde çalıştırılmalıdır. Migration/seed veri yazar; production DB üzerinde bir doğrulama komutu olarak çalıştırmayın.

```bash
bun run server/src/db/migrate.ts
bun run server/src/scripts/migrate-seed.ts
bun run server/src/scripts/seed-users.ts

(cd server && bun x tsc --noEmit)
(cd client && bun x tsc --noEmit)
```

Her adım `0` çıkış koduyla bitmelidir. Migration ve seed'leri test DB üzerinde ikinci kez çalıştırarak tekrar çalıştırılabilirliği kontrol edin. Next build ayrıca yapılmalıdır; TypeScript kontrolü tek başına production image build'ini kanıtlamaz. Bu rehber hazırlanırken DB'ye yazan bu komutlar çalıştırılmamıştır.

<a id="6-production-ortam-degiskenleri"></a>
## 6. Production ortam değişkenleri

Dokploy Compose uygulamasının **Environment** alanı Compose değişkenlerini besler; bütün değerler otomatik olarak her container'a aktarılmaz. Servisin `environment` veya `build.args` bölümünde karşılığı bulunmalıdır. [Dokploy Compose environment açıklaması](https://docs.dokploy.com/docs/core/docker-compose#environment).

### 6.1 Örnek tam kurulum şablonu

Bu şablon tek klinik, telefon etkin ve dental fast kurulum içindir. Bölüm 7'deki eksik eşlemeleri tamamlayın. `DEGISTIR_...` alanlarını gerçek değerlerle değiştirin; kullanmadığınız entegrasyonların alanlarını boş bırakın.

```dotenv
# PostgreSQL: URL içindeki kullanıcı/parola POSTGRES_* ile aynı olmalıdır.
POSTGRES_USER=voiceai
POSTGRES_PASSWORD=DEGISTIR_DB_HEX_PAROLA
DATABASE_URL=postgresql://voiceai:DEGISTIR_DB_HEX_PAROLA@voiceai-postgres:5432/voiceai
REDIS_URL=redis://voiceai-redis:6379

# Public URL'ler: sonda / kullanmayın.
APP_URL=https://api.example.com
CLIENT_APP_URL=https://klinik.example.com
CORS_ORIGIN=https://klinik.example.com
DEFAULT_CLINIC_NAME=Ornek Klinik
DEFAULT_CLINIC_HOSTS=klinik.example.com,api.example.com
PLATFORM_ADMIN_HOSTS=klinik.example.com

# Ayrı, rastgele üretilmiş değerler kullanın.
JWT_SECRET=DEGISTIR_JWT_HEX_64
INTERNAL_PROXY_SECRET=DEGISTIR_PROXY_HEX_64
ADMIN_PASSWORD=DEGISTIR_LEGACY_ADMIN_PAROLASI
INITIAL_ADMIN_EMAIL=yonetici@example.com
INITIAL_ADMIN_PASSWORD=DEGISTIR_ILK_YONETICI_PAROLASI
INTEGRATION_ENCRYPTION_KEY=DEGISTIR_HEX_64

# Frontend build arg'ları. API_URL aynı frontend origin'idir.
NEXT_PUBLIC_API_URL=https://klinik.example.com
NEXT_PUBLIC_BACKEND_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com/ws

# Gemini: model adı mevcut kodun allowlist değeridir.
GEMINI_API_KEY=DEGISTIR_GEMINI_API_ANAHTARI
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_LIVE_VOICE=Aoede
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768

# Opsiyonel service-account / hesap havuzu seed'i.
GOOGLE_CREDENTIALS_JSON=
GOOGLE_CLOUD_PROJECT=
GOOGLE_VERTEX_LOCATION=europe-west1

# Opsiyonel Google Calendar OAuth.
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
OAUTH_REDIRECT_URI=https://api.example.com/api/admin/settings/calendar/callback

# Opsiyonel Evolution API. Aktifleştirince doldurun.
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_WEBHOOK_BASE_URL=https://api.example.com

# Telefon. Asterisk service'i profiles eklenmedikçe her zaman başlar.
TELEPHONY_ENABLED=1
AUDIOSOCKET_PORT=12000
ASTERISK_AMI_HOST=voiceai-asterisk
ASTERISK_AMI_PORT=5038
ASTERISK_AMI_USER=voiceai
ASTERISK_AMI_SECRET=DEGISTIR_ORTAK_AMI_PAROLASI
TELEPHONY_CLINIC_HOSTNAME=klinik.example.com
TELEPHONY_DID_MAP=DEGISTIR_DID=klinik.example.com
NETGSM_SIP_HOST=sip.netgsm.com.tr
NETGSM_SIP_PORT=5060
NETGSM_SIP_TRANSPORT=tcp
NETGSM_SIP_USER=DEGISTIR_SIP_KULLANICISI
NETGSM_SIP_PASSWORD=DEGISTIR_SIP_PAROLASI
NETGSM_PUBLIC_IP=DEGISTIR_VPS_PUBLIC_IPV4
RTP_START=10000
RTP_END=10200
PHONE_NOISE_GATE_RMS=0
PHONE_NOISE_GATE_TRAILING_MS=300
PHONE_NOISE_GATE_PREROLL_MS=60
PHONE_VAD_SILENCE_MS=300
PHONE_OUTPUT_START_BUFFER_MS=700
PHONE_OUTPUT_BUFFER_MS=1200

# Bu eski env alanları güncel klinik SMS panel ayarlarının yerine geçmez.
NETGSM_API_BASE=https://api.netgsm.com.tr
NETGSM_API_USERCODE=
NETGSM_API_PASSWORD=
NETGSM_API_MSGHEADER=

# Dental CPU / fast.
DENTAL_SEGMENTATOR_URL=http://voiceai-dental-segmentator:8000
DENTAL_SEGMENTATOR_MODE=fast
DENTAL_SEGMENTATOR_DATASET=Dataset112_DentalSegmentator_v100
DENTAL_SEGMENTATOR_DEVICE=cpu
```

Güçlü hex değer üretmek için her farklı sır için ayrı kez çalıştırın:

```bash
openssl rand -hex 32
```

### 6.2 Değişkenlerin anlamı ve öncelikleri

| Grup | Dikkat edilecek nokta |
|---|---|
| `DATABASE_URL` | Production container adresi `voiceai-postgres:5432`; yerel `localhost:5433` kullanmayın |
| `POSTGRES_HOST_OVERRIDE` | Compose server'da `voiceai-postgres` olarak sabit; entrypoint yalnız hostname'i değiştirir, yanlış port/parolayı düzeltmez |
| `REDIS_HOST_OVERRIDE` | Compose server'da `voiceai-redis` olarak sabit; URL portunu değiştirmez |
| `POSTGRES_PASSWORD` | Sadece env değiştirmek mevcut PostgreSQL volume'undaki kullanıcının parolasını değiştirmez |
| `JWT_SECRET` | Oturum imzalama; değiştirmek mevcut oturumları etkiler |
| `INTERNAL_PROXY_SECRET` | Client ve server'da birebir aynı olmalı; klinik hostname imzası |
| `INITIAL_ADMIN_*` | Yalnız ilk kullanıcı oluşturma; mevcut kullanıcının parolasını yeniden yazmaz |
| `ADMIN_PASSWORD` | Eski admin-auth akışı; e-posta/parola kullanıcı hesabından ayrıdır |
| `INTEGRATION_ENCRYPTION_KEY` | Tam 64 hex karakter; şifrelenmiş entegrasyon kayıtlarıyla birlikte korunmalı |
| `DEFAULT_CLINIC_HOSTS` | Hostname listesi; `https://` veya path yazmayın. Buradaki frontend/API aynı kliniğe aittir |
| `PLATFORM_ADMIN_HOSTS` | Platform yönetimine izin verilen frontend hostname'leri; rolün yerini tutmaz |
| `CORS_ORIGIN` | Virgülle ayrılmış tam origin; şema dahil, ör. `https://klinik.example.com` |
| `SERVER_URL`, `BACKEND_PROXY_URL` | Client container için iç HTTP adresi; ana Compose bunları zaten ayarlar |
| `NEXT_PUBLIC_*` | Image build sırasında frontend'e gömülür; sır içermez, değişince rebuild gerekir |
| `NEXT_PUBLIC_WS_URL` | Docker build arg mevcut; güncel aktif ana sayfa bunu kullanmıyor. Backend `/ws` ile karıştırmayın |
| `GEMINI_LIVE_MODEL` | Kod yalnız `gemini-3.8-live` allowlist'ini kabul ediyor; farklı env değeri sessiz fallback yapabilir |
| `GEMINI_LIVE_VOICE` | Compose geçiriyor ancak güncel backend sesi DB'deki `ai.voice_name` ayarından okuyor |
| `GOOGLE_CREDENTIALS_JSON` | Tek satır base64 service-account JSON; hesap seed'i için. API-key ile çalışan AI yollarının yerine geçmez |
| `GOOGLE_CALENDAR_ID`, `NETGSM_API_*` | Örnek env'de bulunmaları ilgili güncel akışın bunları okuduğu anlamına gelmez; klinik panel ayarlarını kullanın |

Model isimleri burada sağlayıcıda erişim garantisi olarak verilmemiştir; mevcut kaynak kod davranışını gösterir. Gerçek Gemini hesabında API/model erişimini ayrıca test edin.

<a id="7-compose-duzeltmeleri-ve-kalici-diskler"></a>
## 7. Compose düzeltmeleri ve kalıcı diskler

### 7.1 Eksik eşlemeleri tamamlama

Aşağıdaki YAML **tam Compose değildir**. Mevcut `docker-compose.dokploy.yml` içindeki ilgili nesnelere birleştirilmelidir; aynı seviyede ikinci `environment`/`volumes` anahtarı eklemeyin. Mevcut DNS override, healthcheck, ağ ve diğer env alanlarını koruyun.

```yaml
services:
  server:
    environment:
      INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL:-admin@klinik.com}
      INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD}
      DEFAULT_CLINIC_NAME: ${DEFAULT_CLINIC_NAME:-Varsayılan Klinik}
    volumes:
      - server_data:/app/data
      - server_uploads:/app/server/public/uploads
      - server_tenant_assets:/app/server/public/tenant-assets

  client:
    build:
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-}

  asterisk:
    environment:
      ASTERISK_AMI_SECRET: ${ASTERISK_AMI_SECRET}
    volumes:
      - asterisk_logs:/var/log/asterisk

volumes:
  server_uploads:
  server_tenant_assets:
  asterisk_logs:
```

`INITIAL_ADMIN_PASSWORD` boşsa seed kodu mevcut varsayılanına döner; bu nedenle gerçek ilk parolayı doldurun. AMI şablonunun kullanıcı adı `[voiceai]` sabittir; yalnız env üzerinden kullanıcı adını değiştirerek uyum beklemeyin.

`NEXT_PUBLIC_API_URL` örneği tek frontend domaini içindir. Çok klinikli tek image kullanımında DICOM URL'leri kodda relative/same-origin yapılmadan bu alanı bir kliniğin domainine sabitlemeyin; ayrıntı Bölüm 11.2'dedir.

### 7.2 Kalıcı veri haritası

| Volume | Container yolu | İçerik | Öncelik |
|---|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | Klinikler, kullanıcılar, randevular, ayarlar, vektörler | Kritik |
| `redis_data` | `/data` | Redis AOF, kuyruk/cache durumu | İş akışları için önemli |
| `server_data` | `/app/data` | Görüşme WAV dosyaları | Kritik |
| `server_uploads` — eklenecek | `/app/server/public/uploads` | Logo, DICOM ve upload dosyaları | Kritik |
| `server_tenant_assets` — eklenecek | `/app/server/public/tenant-assets` | Kliniğe özel branding; bazı logo içerikleri DB'de de bulunur | Dosya bütünlüğü |
| `dental_segmentator_models` | `/models` | İndirilen nnU-Net ağırlıkları | Yeniden indirilebilir ama maliyetli |
| `asterisk_logs` — isteğe bağlı ek | `/var/log/asterisk` | Asterisk logları; etkinse CDR dosyaları | Operasyon ihtiyacına göre |

Yeni kurulumda boş volume kullanılabilir. Mevcut container'a uploads volume eklemeden **önce** eski dizini dışarı kopyalayın ve yeni volume'a aktarın; boş mount var olan dosyaları görünmez yapabilir. Veritabanı yedeği ses/DICOM dosyalarını içermez.

### 7.3 Telefon veya dental olmadan ilk kurulum

Ana Dokploy dosyası altı servisi de başlatır. Sadece env'de `TELEPHONY_ENABLED=0` yapmak Asterisk'in SIP bilgisi istemesini engellemez. Kısmi kurulum istenirse ilgili service bloklarına şu profiles alanlarını ekleyin:

```yaml
services:
  asterisk:
    profiles: [telephony]
  dental-segmentator:
    profiles: [dental-ai]
```

Bu değişiklikten sonra normal `up` çekirdek dört servisi başlatır. Tam kurulum için Compose çalıştıran ortamda `COMPOSE_PROFILES=telephony,dental-ai` tanımlayın veya tam compose komutuna `--profile telephony --profile dental-ai` ekleyin. Dokploy'da bir özel komut kullanılıyorsa panelin gösterdiği **tam komutu ve proje adını** koruyun; yalnız ek bayrak yazmak varsayılan komutun yerini alabilir. [Dokploy Advanced komut davranışı](https://docs.dokploy.com/docs/core/docker-compose#advanced).

<a id="8-dokploy-projesini-olusturma-ve-deploy"></a>
## 8. Dokploy projesini oluşturma ve deploy

### 8.1 Arayüz adımları

1. **Projects → Create Project:** `voiceai` adlı proje oluşturun.
2. Kullanılıyorsa `production` environment'ını seçin.
3. **Create Service → Docker Compose** seçin.
4. Çalıştırma türünü **Docker Compose** yapın. Mevcut dosya `build:` içerdiği için Docker Stack moduyla doğrudan kullanılamaz. [Dokploy Compose/Stack ayrımı](https://docs.dokploy.com/docs/core/docker-compose).
5. Git kaynağı, repository ve release branch/commit'ini seçin.
6. Compose dosya yolunu `./docker-compose.dokploy.yml` yapın; çalışma/build context repository kökü olmalıdır.
7. Bölüm 6 değişkenlerini Environment alanına girip kaydedin.
8. Bölüm 2 ve 7 hazırlıklarının seçtiğiniz Git sürümünde bulunduğunu doğrulayın.
9. Bölüm 9'daki frontend/backend domainlerini ekleyin. Public yayın engelleri çözülene kadar erişimi yöneticiyle sınırlandırın.
10. **Preview Compose** ekranında env eşlemelerini, volume'ları, network alias'larını ve Traefik hedef portlarını kontrol edin; secret içeren çıktıyı paylaşmayın.
11. Deploy'u başlatıp her servisin build/runtime logunu takip edin.

Bu rehber mevcut `dokploy-network` alias düzenini kullanır. Isolated Deployments gibi ağ dönüştüren seçenekleri etkinleştirirseniz Preview Compose'da altı servisin birbirine erişimini ve alias'ların korunmasını ayrıca doğrulayın. [Dokploy domain ve ağ üretimi](https://docs.dokploy.com/docs/core/docker-compose/domains).

### 8.2 Başlama sırası

```text
postgres + redis → healthcheck başarılı
  → server entrypoint
      → hostname override
      → migrate.ts
      → migrate-seed.ts
      → seed-users.ts
      → index.ts / HTTP / WS / workers / cron / opsiyonel AudioSocket
  → client ve asterisk

dental-segmentator → bağımsız başlar, frontend tarafından çağrılır
```

Backend entrypoint `set -e` kullanır. İlk üç veri hazırlama adımından biri hata verirse HTTP sunucusu başlamaz. Restart döngüsünde yalnız son log satırına değil ilk migration/seed hatasına bakın.

### 8.3 Operasyon komutları için doğru hedefi seçme

Aşağıdaki bölümlerde `dc` işlevi kullanılır. Bunu **Dokploy'un deploy ettiği sunucuda**, panelin gösterdiği gerçek Compose proje adı, render edilmiş Compose dosyası ve Environment dosyasıyla tanımlayın. Kendi checkout'unuzdan farklı `-p` ile `up` çalıştırmak ikinci stack ve boş volume oluşturabilir.

```bash
export VOICEAI_PROJECT='DOKPLOY_GERCEK_COMPOSE_PROJE_ADI'
export VOICEAI_COMPOSE='/gercek/deployment/yolu/docker-compose.dokploy.yml'
export VOICEAI_ENV='/gercek/deployment/yolu/.env'

dc() {
  docker compose --env-file "$VOICEAI_ENV" \
    -p "$VOICEAI_PROJECT" -f "$VOICEAI_COMPOSE" "$@"
}

dc ps
dc logs --tail=100 server
```

Dosya yolunu bilmiyorsanız Dokploy servis terminalinden ilgili container içinde çalışın. Compose adını ve config yolunu secret göstermeden görmek için:

```bash
docker ps --format '{{.ID}}  {{.Names}}  {{.Status}}'
docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' CONTAINER_ID
docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' CONTAINER_ID
```

<a id="9-domain-https-ve-proxy"></a>
## 9. Domain, HTTPS ve proxy

Dokploy Compose servisi → **Domains → Add Domain**:

| Alan | Frontend | Backend |
|---|---|---|
| Host | `klinik.example.com` | `api.example.com` |
| Service | `client` | `server` |
| Container port | **3002** | **3001** |
| Path | `/` | `/` |
| HTTPS | Etkin | Etkin |
| Certificate | Let's Encrypt veya mevcut uygun sertifika | Aynı |
| İç bağlantı | HTTP | HTTP |

Domain değişikliklerinden sonra Compose servisini yeniden deploy edin; yönlendirme etiketleri deploy sırasında uygulanır. Manuel Traefik label'ı ile UI domain yönetimini aynı host için üst üste kurmayın. [Dokploy domain davranışı](https://docs.dokploy.com/docs/core/domains).

Frontend `package.json` içindeki geliştirme/start portu 3000 olabilir; Docker runner **3002** dinler. Dokploy UI'nin 3000 portu ile karıştırmayın.

Frontend API istekleri çoğunlukla aynı origin `/api/...` → Next.js route → `http://voiceai-server:3001` yolunu izler. İmzalı hostname ile doğru klinik bağlamı korunur. Client/backend `INTERNAL_PROXY_SECRET` aynı olmalı; `Host`/`X-Forwarded-Proto` bilgisini proxy zincirinde yanlış değiştirmeyin.

Backend için ayrıca `3001:3001` host publish eklemeyin; public HTTP(S) girişini Traefik 80/443 üzerinden yönetir. WebSocket kullanılıyorsa `wss://api.example.com/ws`, SSE kullanılıyorsa ilgili streaming endpoint için bağlantının açık kalmasını doğrulayın. Proxy üzerinde büyük DICOM yüklemelerini kesen body/time limitleri ve stream buffering ayarlarını kontrol edin.

<a id="10-postgresql-redis-ve-ilk-yonetici"></a>
## 10. PostgreSQL, Redis ve ilk yönetici

### 10.1 Veritabanı erişimi

`pgvector/pgvector:pg16` kullanılmasının nedeni RAG embedding sütunlarının `vector(768)` olmasıdır. Düz PostgreSQL image'ına geçmek extension kurulumunu ayrıca gerektirir.

```bash
dc exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d voiceai'
dc exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d voiceai -c "SELECT extname FROM pg_extension WHERE extname IN ('\''vector'\'', '\''pgcrypto'\'');"'
dc exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d voiceai -c "SELECT hostname, is_active FROM clinic_domains ORDER BY hostname;"'
dc exec -T redis redis-cli ping
```

Beklenen: PostgreSQL accepting connections, `vector` ve `pgcrypto` satırları, doğru klinik domainleri ve Redis `PONG`. Extension/domain sorgularını backend migration tamamlandıktan sonra çalıştırın. Redis örneği auth olmadan iç ağda çalışır; paylaşılan Dokploy ağına katılan servisler güvenilir olmalıdır. Ayrı ortamların alias/Redis verisini karıştırmayın.

### 10.2 Migration ve seed

Container bunları otomatik çalıştırır:

```text
bun run /app/server/src/db/migrate.ts
bun run /app/server/src/scripts/migrate-seed.ts
bun run /app/server/src/scripts/seed-users.ts
```

Tekrar çalıştırılabilen DDL ve seed davranışları vardır; buna rağmen tüm eski veritabanlarına kayıpsız uygulanacağı garanti edilmez. Özellikle eski `doctors` tablosu migration'ını yedekten restore edilmiş test kopyasında inceleyin. Bazı hatalar kod içinde yakalandığı için yalnız “Tamamlandı” loguna bakmayın; kullanılacak özellikleri de doğrulayın.

`migrate-seed` varsayılan akışlar, selamlama metinleri ve eski kurulumdan gelen caller ID gibi değerler ekler. Yeni kliniğin adı, karşılama mesajı ve dış arama numarasını panelden düzeltin.

### 10.3 İlk giriş

1. `https://klinik.example.com/login` sayfasını açın.
2. `INITIAL_ADMIN_EMAIL` ve `INITIAL_ADMIN_PASSWORD` ile giriş yapın.
3. Kullanıcının yönetici/platform yetkilerini ve doğru klinik bilgisini kontrol edin.
4. Klinik adı, logo, iletişim ve çalışma saatlerini düzenleyin.
5. Gerekli personel hesaplarını oluşturup rollerini atayın.
6. Varsayılan hesap yanlışlıkla oluşturulduysa yalnız yeni env tanımlamakla yetinmeyin; mevcut hesabın parolasını/erişimini panelden düzeltin.

`seed-users.ts` mevcut e-postanın parolasını değiştirmez, platform yöneticisi işaretini günceller. Kullanıcı parolası değiştirmek için tekrar seed çalıştırmak bir parola sıfırlama yöntemi değildir.

### 10.4 Yeni klinik domaini

`.env.example` içindeki “ilk girişte otomatik klinik oluşturma” açıklaması güncel auth davranışıyla uyuşmuyor. Bilinmeyen domainle login 404 dönebilir.

1. Platform yetkili hostundan paneli açın.
2. Klinik kaydını ve domainini platform panelinden oluşturun.
3. DNS ve Dokploy frontend domain yönlendirmesini ekleyin.
4. Personel üyeliklerini tanımlayın.
5. Yeni host üzerinde login ve veri izolasyonunu test edin.

`DEFAULT_CLINIC_HOSTS` içine yeni müşterinin domainini eklemek, onu varsayılan kliniğe bağlayabilir. Farklı klinikler için bu yöntemi kullanmayın. Ortak ağda ikinci VoiceAI stack'i kuracaksanız `voiceai-postgres`, `voiceai-redis`, `voiceai-server` gibi bütün alias'ları da ortama özel hale getirin.

<a id="11-frontend-ve-backend-dogrulamasi"></a>
## 11. Frontend ve backend doğrulaması

### 11.1 Container ve HTTP

```bash
dc ps
dc exec -T client node -e 'fetch("http://127.0.0.1:3002/").then(r => { console.log(r.status); if (!r.ok) process.exit(1) }).catch(() => process.exit(1))'
dc exec -T server bun -e 'const r = await fetch("http://127.0.0.1:3001/api/auth/me"); console.log(r.status); process.exit(r.status === 401 ? 0 : 1)'

curl -sS -o /dev/null -w '%{http_code}\n' https://klinik.example.com/login
curl -sS -o /dev/null -w '%{http_code}\n' https://klinik.example.com/api/auth/me
curl -sS -o /dev/null -w '%{http_code}\n' https://api.example.com/api/auth/me
```

Login sayfası için 200, oturumsuz `auth/me` için 401 beklenir. Bu kontroller yalnız erişilebilirlik ve auth route davranışını doğrular.

Mevcut backend Compose healthcheck'i `fetch('/')` sonucunun HTTP kodunu kontrol etmiyor; 404/500 yanıtı bile başarılı süreç çıkışı üretebilir. Aktif backend'de bağımsız `/healthz` yoktur. `server/src/api/admin.ts` içindeki health route'u aktif `index.ts` uygulamasına bağlanmış değildir. Dolayısıyla böyle bir endpoint varmış gibi Dokploy probe tanımlamayın.

### 11.2 Uçtan uca kabul testi

1. Login yapın; token cookie'sinin frontend hostunda, `HttpOnly` ve HTTPS altında `Secure` olduğunu doğrulayın.
2. Panelde doğru klinik adı ve personel listesini görün.
3. Test amaçlı bir randevu oluşturup yeniden okuyun; gerçek hastaya bildirim tetiklemeyen test kaydı kullanın.
4. Logo yükleyin, sayfayı yenileyin, logo endpoint'inin çalıştığını doğrulayın.
5. DICOM kullanılıyorsa test dosyasını yükleyin, geri açın ve frontend'in `localhost` adresine istek atmadığını kontrol edin.
6. Kontrollü bir redeploy sonrasında randevu, logo, DICOM ve ses kayıtlarının kaldığını doğrulayın.
7. Bildirim/SSE akışı kullanılıyorsa ikinci bir panel sekmesinde değişikliğin geldiğini test edin.
8. AI ve diğer entegrasyonları aşağıdaki ayrı kabul adımlarıyla sınayın.

**Çok domainli frontend:** `NEXT_PUBLIC_API_URL=https://klinik.example.com` geçici düzeltmesi tek klinik domaini içindir. Aynı frontend image'ı farklı klinik hostlarından kullanılacaksa DICOM çağrılarının relative/same-origin çalışması için kaynak kod düzeltilmelidir; bütün klinikleri build'de tek domaine sabitlemeyin.

Anahtar endpoint'ini test ederken response gövdesini terminale yazdırmayın:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://klinik.example.com/api/direct-session
```

Mevcut kod ve dolu client anahtarıyla 200 gelmesi beklenir ve Bölüm 2'deki engelin sürdüğünü gösterir. Kalıcı anahtar döndüren route kapatıldıysa 403/404 gibi erişim reddi beklenir. Yeni güvenli token akışı uygulanmışsa yalnız status code yeterli değildir; dönen değerin kalıcı API anahtarı olmadığı ayrıca kod/işlev testiyle doğrulanmalıdır.

<a id="12-gemini-rag-ve-google-calendar"></a>
## 12. Gemini, RAG ve Google Calendar

### 12.1 Gemini çalışma modu

1. Backend `GEMINI_API_KEY` değerini tanımlayın.
2. Gemini API'ye container'dan DNS/HTTPS çıkışının çalıştığını doğrulayın.
3. Panelde model, ses, karşılama ve konuşma akışını kontrol edin.
4. Kodun allowlist'ine uymayan modelin env ile seçilemeyeceğini dikkate alın.
5. Sesli bağlantı sırasında yetki, model bulunamadı veya kota hatası varsa gerçek sağlayıcı yanıtını inceleyin; container'ın healthy olması AI erişimini kanıtlamaz.

`GOOGLE_CREDENTIALS_JSON` ve `GOOGLE_CLOUD_PROJECT` opsiyonel hesap havuzu seed'ini besler. Bu iki değişkenin bulunması API-key kullanan mevcut Live/RAG yollarındaki `GEMINI_API_KEY` ihtiyacını kaldırmaz.

Service-account kullanılacaksa JSON dosyasını tek satır base64 olarak, güvenli yerel ortamda dönüştürün. Base64 şifreleme değildir. Değeri Dokploy Environment'a girin; Git'e veya bu dokümana koymayın.

### 12.2 RAG ve embedding

`GEMINI_EMBEDDING_DIMENSIONS=768` bırakın. Bu değer PostgreSQL `vector(768)` şemasıyla eşleşir. Boyut/model değişikliği gerekiyorsa mevcut belgelerin yeniden embed edilmesini ve indeks/şema uyumunu birlikte planlayın.

Mevcut seed kodu, `GOOGLE_CREDENTIALS_JSON` boşken hazır bilgi bankası prompt'larını atlar; embedding çağrısı ise API key kullanır. Bu yüzden sadece API key tanımlanmış bir kurulumda otomatik hazır RAG belgeleri oluşmuş varsayılmamalıdır.

Panelden küçük bir test bilgi belgesi ekleyin; embed edildiğini ve ilgili soru sorulduğunda beklendiği gibi kullanıldığını doğrulayın. Seed logundaki belge bazlı başarısızlıkları kontrol edin.

### 12.3 Google Calendar OAuth

1. Google Cloud projesinde Calendar API erişimini ve OAuth consent screen'i hazırlayın.
2. Web uygulaması için OAuth client oluşturun.
3. Redirect URI olarak tam olarak şunu kaydedin:

   ```text
   https://api.example.com/api/admin/settings/calendar/callback
   ```

4. `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` alanlarını backend'e aktarın.
5. `APP_URL=https://api.example.com`, `CLIENT_APP_URL=https://klinik.example.com` değerlerini kontrol edip redeploy edin.
6. İlgili klinik domaininden giriş yapıp panelde Calendar bağlantısını başlatın.
7. Yetki verin, dönüşte doğru frontend/klinik sayfasının açıldığını doğrulayın.
8. Kontrollü test takviminde bir randevu akışını sınayın.

Redirect URI Google Console ile karakter karakter aynı olmalıdır. Consent ekranı test modundaysa kullanılan hesabın test kullanıcıları arasında olduğundan emin olun. [Google sunucu tarafı OAuth belgesi](https://developers.google.com/identity/protocols/oauth2/web-server). `GOOGLE_CALENDAR_ID` env alanını doldurmak mevcut OAuth kurulumunun yerine geçmez. Bu bölümdeki callback yolu doğrudan `server/src/index.ts` uygulamasından alınmıştır; API/consent/client hazırlığı için [Google Calendar başlangıç belgesindeki ortam kurulumu](https://developers.google.com/workspace/calendar/api/quickstart/js#set_up_your_environment) kullanılabilir.

<a id="13-asterisk-ve-netgsm"></a>
## 13. Asterisk ve Netgsm

### 13.1 Hazırlık

Netgsm hesabında trunk kullanıcı/parolasını, yetkilendirilmiş sunucu IP'sini, inbound yönlendirmeyi ve kullanılan transport'u doğrulayın. Depodaki örnek IP/telefon numarasını yeni kurulum bilgisi olarak kabul etmeyin. Sağlayıcının kendi hesabınız için verdiği bilgiler esas alınmalıdır.

| Bağlantı | Ayar |
|---|---|
| Netgsm → Asterisk | SIP 5060, trunk transport'una uygun TCP/UDP |
| Netgsm ↔ Asterisk | RTP UDP 10000–10200 |
| Asterisk → backend ses | `AUDIOSOCKET_HOST=voiceai-server`, port 12000 |
| Asterisk → backend çağrı kaydı | `BACKEND_HTTP_PORT=3001` |
| Backend → Asterisk kontrol | `ASTERISK_AMI_HOST=voiceai-asterisk`, port 5038 |
| AMI kullanıcı | `voiceai`; manager şablonuyla aynı |
| AMI parola | Backend ve Asterisk'te aynı `ASTERISK_AMI_SECRET` |

Backend'de `TELEPHONY_ENABLED=1` gerekir; `true` aynı anlama gelmez. `BACKEND_HTTP_PORT` değerini ayrı kurulumlarda açıkça 3001 verin; Asterisk entrypoint'in varsayılanı 3000'dır.

### 13.2 NAT ve portlar

`NETGSM_PUBLIC_IP`, Asterisk'in dışarı ilan edeceği bu VPS'nin public IP'sidir. Özel Docker IP'si, eski sunucu IP'si veya domain proxy'sinin IP'si kullanılmaz.

Mevcut SIP şablonunda dış signaling/media adresi ve NAT yardımcı ayarları bulunur. RTP aralığını değiştirirseniz üç yerde birlikte değiştirin:

1. `RTP_START` ve `RTP_END`;
2. Compose `ports` eşlemesi;
3. Cloud/host firewall.

`docker-compose.asterisk.yml` ile ana Compose Asterisk'ini aynı hostta birlikte başlatmayın; SIP/RTP portları çakışır. SIP veya RTP'yi normal HTTP Traefik domain ayarı üzerinden taşımaya çalışmayın.

### 13.3 DID → klinik eşlemesi

```dotenv
TELEPHONY_CLINIC_HOSTNAME=klinik.example.com
TELEPHONY_DID_MAP=8500000001=klinik.example.com,8500000002=ikinci-klinik.example.com
```

Örnekteki numaraları gerçek DID değerleriyle değiştirin. AGI eşlemesi gelen DID/DNID biçimine bağlıdır; baştaki `0`, ülke kodu ve trunk'tan gelen değer aynı formatta olmalıdır. Domainler aktif klinik kayıtlarında bulunmalıdır. Backend ayrıca kayıtlı klinik telefon numaralarından domain çözebilir.

Paneldeki `outbound_caller_id` ayarını trunk'ın yetkili numarasıyla değiştirin. `infra/asterisk/templates/extensions.conf.tmpl` içindeki `dynamic-forward` context'inde ayrıca sabit caller ID vardır; yeni kurulum için bu satırın uyarlanması gerekir. SIP env'ini değiştirmek bu satırı kendiliğinden değiştirmez.

### 13.4 Doğrulama

```bash
dc exec -T asterisk asterisk -rx 'core show version'
dc exec -T asterisk asterisk -rx 'module show like audiosocket'
dc exec -T asterisk asterisk -rx 'pjsip show registrations'
dc exec -T asterisk asterisk -rx 'pjsip show endpoints'
dc exec -T asterisk asterisk -rx 'dialplan show from-netgsm'
dc exec -T asterisk asterisk -rx 'manager show users'
dc exec -T asterisk curl -fsS 'http://voiceai-server:3001/api/telephony/register?hostname=klinik.example.com'
dc logs --tail=100 asterisk server
```

Son HTTP isteğinde UUID/caller bulunmadığından çağrı kaydı oluşturulmaz; JSON içindeki `ok:true` klinik çözümünün başarılı olduğunu gösterir. Yalnız HTTP 200 yeterli değildir.

Gerçek kabul testi için yönetiminizdeki test numarasıyla inbound/outbound çağrı, iki yönlü ses, doğru klinik karşılama, aktarım ve kayıt oynatma kontrol edilmelidir. Dokploy Asterisk healthcheck'i yalnız CLI komutunun çalışmasını kontrol eder; SIP registration veya ses kalitesini kanıtlamaz.

İlk testlerde noise gate değerlerini varsayılan bırakın. Ses kesikliği veya gecikme ölçüldükten sonra `PHONE_*` ayarlarını birer birer değiştirin. Asterisk log/CDR volume'u eklemek CDR üretimini kendiliğinden etkinleştirmez; aktif modül/logger yapılandırmasını ayrıca doğrulayın.

<a id="14-dentalsegmentator-ve-dicom"></a>
## 14. DentalSegmentator ve DICOM

### 14.1 Fast mod

Varsayılan `DENTAL_SEGMENTATOR_MODE=fast`, model indirmeden CPU üzerinde seçilmiş axial dilimlerden dental ark çıkarır. Bu çıktı tam nnU-Net segmentasyonu değildir.

Frontend runtime env:

```dotenv
DENTAL_SEGMENTATOR_URL=http://voiceai-dental-segmentator:8000
```

Python servis env:

```dotenv
DENTAL_SEGMENTATOR_MODE=fast
DENTAL_SEGMENTATOR_DEVICE=cpu
DENTAL_SEGMENTATOR_DATASET=Dataset112_DentalSegmentator_v100
NNUNET_RESULTS=/models/nnUNet_results
```

`NNUNET_RESULTS` ana Compose'da zaten sabittir. Servise public domain veya host port publish eklemeyin; Next.js oturum kontrollü API route'ları üzerinden erişilir. Python servisinin kendi endpoint'lerinde uygulama auth kontrolü bulunmaz.

```bash
dc exec -T dental-segmentator python -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8000/health").read().decode())'
```

Beklenen `ok:true`, `mode:"fast"`. Fast modda `modelReady:false` normaldir.

### 14.2 Full mod ve model indirme

1. Dental container'ını fast modda başlatın.
2. `/models` volume'unun bağlı olduğunu doğrulayın.
3. Modeli **açıkça** indirin:

   ```bash
   dc exec -T dental-segmentator python download-model.py
   ```

4. Beklenen kurulum yolu:

   ```text
   /models/nnUNet_results/Dataset112_DentalSegmentator_v100
   ```

5. Kaynak limitlerini gerçek hacme uygun yükseltin; mevcut 4 GB limitle full işin çalışacağını varsaymayın. Shared memory ihtiyacını da test edin.
6. `DENTAL_SEGMENTATOR_MODE=full` ayarlayıp ilgili servisi yeniden deploy edin.
7. `/health` içinde `mode:"full"` ve `modelReady:true` görünmesini doğrulayın.
8. Gerçekçi boyutta anonim test CBCT serisiyle işin `complete` durumuna geldiğini doğrulayın.

İndirme script'i varsayılan olarak resmî Zenodo arşivini kullanır. Mevcut klasör varsa tekrar indirmez; yarım/yanlış bir kurulumda yalnız klasör varlığını görmek yeterli değildir. Farklı dataset env'i vermek download script'indeki sabit dataset adını değiştirmez.

GPU kullanımı için CUDA uyumlu PyTorch kurulumu, uygun image ve Docker GPU tahsisi ayrıca hazırlanmalıdır. Yalnız `DENTAL_SEGMENTATOR_DEVICE=cuda` yazmak mevcut CPU image'ını GPU image'ına dönüştürmez.

### 14.3 Upload ve iş yaşam döngüsü

| Özellik | Mevcut davranış |
|---|---|
| Minimum dosya/kesit | En az 16 DICOM kesiti |
| Python toplam upload sınırı | Varsayılan 2048 MB |
| Tek DICOM tedavi upload'u | Ayrı backend yolu; en fazla 20 MiB ve `.dcm` |
| İş gönderimi | Frontend `/api/dental-segmentator/arch`, başarılı başlangıç 202 |
| İş izleme | `/api/dental-segmentator/jobs/{jobId}` |
| İş kuyruğu | Tek süreç içinde seri inference |
| İş durumu | RAM'de; restart ile kaybolur |
| Geçici seri | `/tmp/dental-segmentator`; iş sonunda silinir |
| Kalıcı dosya | `/models` altındaki ağırlıklar |

Next.js multipart formu okuyup yeniden gönderir. Python'un 2 GB sınırı client RAM'i veya proxy limitinin bunu kaldırdığı anlamına gelmez. İş çalışırken dental servisi yeniden başlatmayın; birden fazla replica, ortak job deposu olmadan polling'i bozabilir.

Opsiyonel `DENTAL_SEGMENTATOR_MAX_UPLOAD_MB`, `DENTAL_SEGMENTATOR_WORKDIR`, `DENTAL_SEGMENTATOR_CORS`, `DENTAL_SEGMENTATOR_MODEL_URL` kaynakta bulunur fakat ana Compose'da aktarılmaz. Bunları kullanacaksanız doğru servis `environment` listesine ekleyin; özellikle sayısal değerleri geçerli biçimde verin.

<a id="15-evolution-api-whatsapp-sms-ve-e-posta"></a>
## 15. Evolution API, WhatsApp, SMS ve e-posta

### 15.1 Evolution API bu Compose'a dahil değildir

Ana VoiceAI Compose'u Evolution API kurmaz. WhatsApp için erişilebilir bir Evolution API v2 kurulumu gerekir. Aynı Dokploy projesinde **ayrı Compose servisi** olarak çalıştırılabilir; kendi PostgreSQL/Redis ve instance volume'ları VoiceAI'den ayrı tutulmalıdır.

Kurulum kaynağı olarak [resmî Evolution API deposunu](https://github.com/evolution-foundation/evolution-api), seçtiğiniz release'in Compose dosyasını ve `.env.example` dosyasını kullanın. Güncel repository image ailesi `evoapicloud/evolution-api` kullanıyor; release/digest'i uyumluluk testinden sonra sabitleyin. [Resmî Compose kaynağı](https://github.com/evolution-foundation/evolution-api/blob/main/docker-compose.yaml).

### 15.2 Dokploy'da Evolution kurulumu

1. `voiceai` projesine `evolution` adlı ayrı Docker Compose servisi ekleyin.
2. Resmî repository'nin test edeceğiniz release'ini seçin veya o release'in Compose dosyasını uyarlayın.
3. API, PostgreSQL, Redis ve instance volume'larının tanımlı olduğunu doğrulayın.
4. Her kuruluma özgü service/network isimleri kullanın; sabit `container_name` değerlerini çoklu kurulumla çakıştırmayın.
5. Resmî örnekteki frontend `3000:80` host eşlemesini kaldırın; bu port Dokploy yönetimiyle çakışır. Evolution API'yi Dokploy Domains üzerinden container port 8080'e bağlayın. Manager kullanılıyorsa kendi domaininden container port 80'e yönlendirin.
6. Evolution'ın kendi Environment alanında aşağıdaki değerleri seçilen release'in örneğiyle eşleştirin.
7. Deploy edin; PostgreSQL/Redis bağlantısı ve API başlangıç loglarını kontrol edin.
8. API'yi `https://whatsapp.example.com` üzerinde HTTPS ile yayınlayın.

```dotenv
# Bunlar Evolution servisinin ortamıdır, VoiceAI ortamı değildir.
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://whatsapp.example.com
AUTHENTICATION_API_KEY=DEGISTIR_EVOLUTION_API_ANAHTARI

POSTGRES_DATABASE=evolution
POSTGRES_USERNAME=evolution
POSTGRES_PASSWORD=DEGISTIR_EVOLUTION_DB_PAROLASI
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:DEGISTIR_EVOLUTION_DB_PAROLASI@evolution-postgres:5432/evolution?schema=public
DATABASE_CONNECTION_CLIENT_NAME=voiceai_evolution

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://evolution-redis:6379/6
CACHE_REDIS_PREFIX_KEY=voiceai_evolution
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false
WEBHOOK_GLOBAL_ENABLED=false
```

Bu blok minimum bağlantı alanlarını gösterir; seçilen Evolution release'inin `.env.example` dosyasındaki diğer gerekli varsayılanların yerine geçen tam bir dosya değildir. Alanlar [resmî environment örneğine](https://github.com/evolution-foundation/evolution-api/blob/main/.env.example) göre kontrol edilmiştir. Ek entegrasyonları kullanmıyorsanız etkinleştirmeyin.

### 15.3 VoiceAI ile eşleştirme

VoiceAI backend'de:

```dotenv
EVOLUTION_API_URL=https://whatsapp.example.com
EVOLUTION_API_KEY=DEGISTIR_EVOLUTION_ILE_AYNI_API_ANAHTARI
EVOLUTION_WEBHOOK_BASE_URL=https://api.example.com
INTEGRATION_ENCRYPTION_KEY=DEGISTIR_KALICI_HEX_64
```

1. VoiceAI'yi runtime env değişikliğiyle yeniden deploy edin.
2. Klinik panelinden WhatsApp/Evolution bölümünü açın.
3. İlgili klinik için bağlantı oluşturun veya mevcut instance bilgilerini tanımlayın.
4. QR kodu ilgili test/işletme telefonundan okutun.
5. Bağlantı durumunun `open` olduğunu doğrulayın.
6. Webhook adresinin `https://api.example.com/api/whatsapp/evolution/<clinic-id>` olduğunu doğrulayın.
7. `x-voiceai-webhook-secret` doğrulamasını koruyun; VoiceAI'nin oluşturduğu instance/webhook ayarlarını rastgele global webhook ile ezmeyin.
8. Yönetiminizdeki test numarasıyla gelen mesaj, panelde kayıt ve gerekiyorsa AI yanıtını sınayın.

Evolution'ın backend public URL'sine ulaşabilmesi gerekir. `localhost` webhook adresi, başka container'daki VoiceAI'ye ulaşmaz. Rutin kurulumda n8n, RabbitMQ veya ayrı mesaj worker container'ı zorunlu değildir; VoiceAI WhatsApp worker'ını backend içinde başlatır.

### 15.4 SMS ve e-posta

Güncel SMS ve SMTP ayarları klinik entegrasyon kayıtlarından okunur. Eski `.env` içindeki `NETGSM_API_*` alanlarını doldurmak yeterli değildir.

Panelde ilgili kliniğin SMS kullanıcı/parola/gönderici başlığını ve SMTP host/port/TLS/kullanıcı bilgilerini girin. Sağlayıcının IP/yetki gereksinimlerini hesabınızda doğrulayın. Önce yönetiminizdeki tek bir test alıcısıyla gönderim deneyin; hatırlatıcıların gerçek hastalara otomatik çalışmasını ilk testin parçası yapmayın.

`server/src/cron/reminders.ts` içindeki SMS opt-out bağlantısı eski kuruluma ait sabit domain kullanıyor. Yeni klinik domaininde SMS hatırlatıcılarını açmadan önce bu bağlantıyı doğru klinik URL'sinden türetecek şekilde düzeltin ve abonelikten çıkma akışını doğrulayın.

<a id="16-ayri-servisler-olarak-kurma"></a>
## 16. Frontend, backend ve altyapıyı ayrı servisler olarak kurma

Frontend ve backend'i bağımsız deploy etmek istiyorsanız aynı Dokploy projesinde ayrı Application servisleri kullanabilirsiniz. Bu seçenek ana Compose kurulumunun alternatifidir; ikisini aynı anda aynı DB/alias/host portlarıyla başlatmayın.

### 16.1 Servis düzeni

| Dokploy servisi | Tür | İçerik |
|---|---|---|
| `voiceai-infra` | Docker Compose | PostgreSQL + Redis |
| `voiceai-backend` | Application / Dockerfile | Bun backend |
| `voiceai-frontend` | Application / Dockerfile | Next.js frontend |
| `voiceai-dental` | Docker Compose veya Application | DentalSegmentator |
| `voiceai-telephony` | Docker Compose | Asterisk; doğrudan SIP/RTP publish |
| `voiceai-evolution` | Opsiyonel ayrı Compose | Evolution + kendi DB/cache'i |

### 16.2 Altyapıyı kurma

1. Ana Dokploy Compose'dan yalnız `postgres` ve `redis` servislerini içeren bir infra dosyası türetin.
2. `postgres_data`, `redis_data`, healthcheck ve `dokploy-network` ayarlarını koruyun.
3. `voiceai-postgres` ve `voiceai-redis` alias'larını koruyun veya ortamınıza özel isimlendirin.
4. PostgreSQL kullanıcı/parolasını girip deploy edin.
5. Bu aşamada yalnız `pg_isready` ve Redis `PING` kontrollerini tamamlayın. Bölüm 10'daki extension/domain SQL kontrollerini backend migration çalıştıktan sonra yapın.

Dokploy'un ayrı Database ürünü de kullanılabilir; bu durumda PostgreSQL image'ının `vector` ve `pgcrypto` extension'larını desteklediğini doğrulayın. Panelin verdiği gerçek internal DNS adını backend'e yazın. `postgres` gibi genel adlara güvenmeyin.

### 16.3 Backend Application

| Dokploy alanı | Değer |
|---|---|
| Source | VoiceAI repository, doğrulanmış release |
| Build type | Dockerfile |
| Dockerfile path | `server/Dockerfile` |
| Build context | `.` — repository kökü |
| Public domain | `api.example.com` |
| Target port | `3001` |
| Replica | `1` |
| Mounts | `/app/data`, `/app/server/public/uploads`, `/app/server/public/tenant-assets` için named volume |
| Command override | EntryPoint'i atlatacak override vermeyin |

Runtime Environment'a Bölüm 6 backend alanlarının tamamını aktarın. **Ayrı Application'da Compose'un otomatik verdiği değerler yoktur**; özellikle şunları açıkça girin:

```dotenv
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://voiceai:DEGISTIR_DB_HEX_PAROLA@voiceai-postgres:5432/voiceai
POSTGRES_HOST_OVERRIDE=voiceai-postgres
REDIS_URL=redis://voiceai-redis:6379
REDIS_HOST_OVERRIDE=voiceai-redis
```

Domain, bootstrap admin, Gemini, JWT, shared proxy secret ve entegrasyon alanlarını da doldurun. `depends_on` ayrı Dokploy servisleri arasında uygulanmaz; DB/Redis hazır olduktan sonra backend'i deploy edin. Compose'daki healthcheck de Application'a otomatik taşınmaz; gerçek endpoint davranışına uygun probe tanımlayın.

Backend service'in Dokploy tarafından üretilen gerçek Docker DNS adını kaydedin. `voiceai-server` alias'ı ayrıca tanımlı değilse aşağıdaki bağlantılarda o gerçek adı kullanın.

### 16.4 Frontend Application

| Dokploy alanı | Değer |
|---|---|
| Dockerfile path | `client/Dockerfile` |
| Build context | `.` |
| Domain / port | `klinik.example.com` / `3002` |
| Start command | Image varsayılanı `node server.js` |
| Kalıcı mount | Normalde gerekmiyor |
| HTTP probe | `/`, port 3002; ek uygulama smoke testleri gerekli |

Build arguments:

```dotenv
NEXT_PUBLIC_API_URL=https://klinik.example.com
NEXT_PUBLIC_BACKEND_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com/ws
SERVER_URL=http://GERCEK_BACKEND_SERVIS_DNS:3001
BACKEND_PROXY_URL=http://GERCEK_BACKEND_SERVIS_DNS:3001
```

Runtime Environment:

```dotenv
NODE_ENV=production
SERVER_URL=http://GERCEK_BACKEND_SERVIS_DNS:3001
BACKEND_PROXY_URL=http://GERCEK_BACKEND_SERVIS_DNS:3001
DENTAL_SEGMENTATOR_URL=http://GERCEK_DENTAL_SERVIS_DNS:8000
INTERNAL_PROXY_SECRET=DEGISTIR_BACKEND_ILE_AYNI_DEGER
ADMIN_PASSWORD=DEGISTIR_LEGACY_ADMIN_PAROLASI
# Yalnız Bölüm 2'deki public endpoint sorunları giderildikten sonra:
GEMINI_API_KEY=DEGISTIR_GEMINI_API_ANAHTARI
```

Builder stage'e verilen env runner stage'e otomatik taşınmış kabul edilmez. Özellikle iç backend URL'leri runtime'da da bulunmalıdır. Frontend ile backend'in aynı erişilebilir Docker ağına bağlı olduğunu doğrulayın.

### 16.5 Asterisk ve dental'i ekleme

Asterisk için ana Compose'daki service'i yeni telephony Compose'a taşıyın. Ayrı dosyada artık bulunmayan `depends_on: server` kaydını kaldırın. `AUDIOSOCKET_HOST` ve backend HTTP hedefi gerçek backend DNS adı, `BACKEND_HTTP_PORT=3001` olmalıdır. Backend'in `ASTERISK_AMI_HOST` değeri de bu yeni Asterisk servisinin alias'ı olmalıdır. Port yayınları, ortak AMI parolası ve DID/domain eşlemesi Bölüm 13 ile aynıdır.

Telephony Compose dosyasını repository kökünde tutuyorsanız build context `./infra/asterisk` kalmalıdır. Servis bloğuyla birlikte üst seviye ağ ve kullanılan volume tanımlarını da taşıyın:

```yaml
networks:
  dokploy-network:
    external: true
volumes:
  asterisk_logs:
```

Dental için context repository kökü, Dockerfile `services/dental-segmentator/Dockerfile`, target port 8000, model mount `/models` ve replica/worker 1 kullanın. Frontend runtime `DENTAL_SEGMENTATOR_URL` adresini güncelleyin. Public domain eklemeyin.

Ayrı dental Compose dosyasında `dokploy-network` ve `dental_segmentator_models` üst seviye tanımlarını koruyun. Application seçilirse `/health` probe'unu iç port 8000 üzerinde ayrıca tanımlayın; full mod kabulünde JSON içindeki `modelReady` yine kontrol edilmelidir.

Son sıra: **infra → backend → frontend → dental/telephony → opsiyonel entegrasyonlar → uçtan uca test**.

<a id="17-yedekleme-ve-geri-yukleme"></a>
## 17. Yedekleme ve geri yükleme

### 17.1 Neleri yedeklemelisiniz?

| Bileşen | Yedek türü |
|---|---|
| VoiceAI PostgreSQL | `pg_dump` custom format, schema ve veri |
| Ses kayıtları | `server_data` volume |
| DICOM/logo/branding | `server_uploads` ve `server_tenant_assets` volume'ları |
| Redis | Kuyruk durumunun korunması için tutarlı AOF/RDB veya durmuş volume yedeği |
| Dental | Model volume'u veya doğrulanmış yeniden indirme kaynağı/sürümü |
| Evolution | Kendi DB'si, Redis'i ve `/evolution/instances` volume'u |
| Konfigürasyon | Release commit/image digest, domain/ağ/env/mount ayarları |
| Şifreleme anahtarı | `INTEGRATION_ENCRYPTION_KEY`; DB'den ayrı güvenli saklama |

Dokploy panelinin kendi yedeği uygulama verilerinin tamamını otomatik yedeklediğiniz anlamına gelmez. Named volume'lar için Dokploy Volume Backups/S3 destination ayarlanabilir. Canlı yazılan volume'un dosya kopyası tutarsız olabileceğinden uygulamaya uygun durdurma/snapshot yöntemi seçin. [Dokploy Volume Backups](https://docs.dokploy.com/docs/core/volume-backups).

### 17.2 PostgreSQL mantıksal yedeği

Sunucuda, Bölüm 8.3 `dc` hedefi doğrulandıktan sonra:

```bash
umask 077
export VOICEAI_BACKUP_DIR="/var/backups/voiceai/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$VOICEAI_BACKUP_DIR"

dc exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d voiceai -Fc' \
  > "$VOICEAI_BACKUP_DIR/voiceai.dump.partial" &&
test -s "$VOICEAI_BACKUP_DIR/voiceai.dump.partial" &&
dc exec -T postgres pg_restore --list < "$VOICEAI_BACKUP_DIR/voiceai.dump.partial" \
  > "$VOICEAI_BACKUP_DIR/voiceai-restore-list.txt" &&
mv "$VOICEAI_BACKUP_DIR/voiceai.dump.partial" "$VOICEAI_BACKUP_DIR/voiceai.dump"
```

Komut zinciri başarısızsa `.partial` dosyayı tamamlanmış yedek olarak kullanmayın; önce hatayı giderin. `pg_dump` canlı DB için tutarlı bir DB görünümü sağlar; aynı anda alınan ayrı dosya/Redis yedekleriyle işlemsel eşzamanlılık sağlamaz. Tam kurtarma noktası gerekiyorsa kısa bakım penceresinde yeni istekleri/çağrıları durdurun, aktif işleri bitirin, yazan servisleri durdurun, ardından DB ve dosya yedeklerini birlikte alın.

Örneğin tam kurulumda yazan servisleri durdurma sırası `client`, `asterisk`, `dental-segmentator`, `server` olabilir. Bu işlem aktif çağrı/işleri keser; boşalmaları beklenmelidir. DB dump sırasında PostgreSQL açık kalır. Redis volume dosyalarını doğrudan arşivleyecekseniz Redis'i de durdurun. Bakım sonunda yalnız önceden etkin servisleri tekrar başlatın; volume'ları silmeyin.

### 17.3 Dosya volume'larını yedekleme

Gerçek volume adları genellikle Dokploy proje adıyla öneklenir. Tahmin ederek farklı stack'in volume'unu seçmeyin:

```bash
docker inspect --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}' BACKEND_CONTAINER_ID
docker volume ls
```

Aşağıdaki yardımcı fonksiyon, yazan servisler durdurulduktan sonra **her seçilen named volume** için kullanılabilir. Değer olarak mantıksal `server_data` yerine yukarıda gördüğünüz gerçek Docker volume adını verin:

```bash
backup_voiceai_volume() {
  docker run --rm \
    --mount "type=volume,src=$1,dst=/source,readonly" \
    --mount "type=bind,src=$VOICEAI_BACKUP_DIR,dst=/backup" \
    alpine:3.20 tar -czf "/backup/$2.tar.gz" -C /source .
}

backup_voiceai_volume GERCEK_SERVER_DATA_VOLUME server-data
backup_voiceai_volume GERCEK_UPLOADS_VOLUME server-uploads
backup_voiceai_volume GERCEK_TENANT_ASSETS_VOLUME server-tenant-assets
```

Gerekli Redis/model/Asterisk/Evolution volume'larına da aynı yöntemi uygulayın; Redis için servis durmuş olmalıdır. Arşiv bütünlüğünü doğrulayın, sunucu dışına şifreli yedek gönderin ve saklama süresini planlayın. Sadece aynı VPS diskinde bulunan yedek, VPS kaybını karşılamaz.

### 17.4 Geri yükleme provası

1. Production'a yazmayan izole bir test ortamı oluşturun.
2. Aynı uyumlu PostgreSQL/pgvector sürümünü başlatın.
3. Boş test DB'ye dump'ı geri yükleyin; mevcut production DB'nin üzerine deneme yapmayın.
4. Dosya arşivlerini yeni boş volume'lara çıkarın, kullanıcı/izinleri doğrulayın.
5. Aynı `INTEGRATION_ENCRYPTION_KEY` değerini test uygulamasına güvenli biçimde aktarın.
6. Test domainlerini ve tüm iç DNS alias'larını test ortamına özel yapın.
7. **Backend başlamadan önce** gerçek telefon/WhatsApp/SMS/e-posta bağlantılarını ve hatırlatıcı gönderimini test ortamından ayırın; örneğin sağlayıcı çıkışını kapatıp DB'deki canlı entegrasyon ayarlarını test değerleriyle değiştirin. Cron başlangıçtan kısa süre sonra çalışır. Yalnız `TELEPHONY_ENABLED=0` veya boş env, DB'de saklanan SMS/WhatsApp ayarlarını kapatmaz. Canlı kimlik bilgileriyle ikinci bir worker kümesini başlatmayın.
8. Login, kayıt sayıları, DICOM/WAV dosyaları ve şifreli entegrasyon ayarlarının okunmasını doğrulayın.

Yalnız restore hedefi olarak hazırlanmış bir PostgreSQL container'ında örnek:

```bash
export VOICEAI_RESTORE_PG='IZOLE_TEST_POSTGRES_CONTAINER_ADI'
docker exec "$VOICEAI_RESTORE_PG" sh -lc 'createdb -U "$POSTGRES_USER" voiceai_restorecheck' &&
docker exec -i "$VOICEAI_RESTORE_PG" sh -lc \
  'pg_restore -U "$POSTGRES_USER" -d voiceai_restorecheck --no-owner --no-privileges --exit-on-error' \
  < "$VOICEAI_BACKUP_DIR/voiceai.dump"
```

Test DB zaten varsa yeni benzersiz bir isim seçin; rehber otomatik `DROP DATABASE` uygulamaz. DB restore edilmiş olması uygulama dosyalarının da geri yüklendiği anlamına gelmez.

<a id="18-guncelleme-geri-donus-ve-kesinti-yonetimi"></a>
## 18. Güncelleme, geri dönüş ve kesinti yönetimi

### 18.1 Her release için

1. Hedef commit ve değişen migration'ları inceleyin.
2. Bölüm 5.4'teki beş zorunlu komutun yerel test ortamında başarılı olduğunu doğrulayın.
3. İlgili Docker image'larını temiz context'te build edin.
4. Geri yüklenebilir DB/dosya yedeği alın; önceki çalışan image/digest ve env'i kaydedin.
5. Aktif görüşme ve dental işlerini bitirin; gerekiyorsa bakım penceresi kullanın.
6. Dokploy'da seçilmiş release'i deploy edin.
7. Migration/seed loglarını, DB/Redis durumunu ve frontend auth akışını doğrulayın.
8. Değişen özelliklerde uçtan uca test yapın.

### 18.2 Hangi değişiklik ne gerektirir?

| Değişiklik | Gereken işlem |
|---|---|
| Frontend kodu, `NEXT_PUBLIC_*` | Frontend image rebuild + redeploy |
| Client iç backend URL'si veya dental URL'si | Runtime env güncellemesi + container yeniden oluşturma |
| Backend kodu/dependency | Backend image rebuild + redeploy; migration tekrar çalışır |
| JWT/proxy/entegrasyon secret | Etkilenen servislerde koordineli runtime redeploy; anahtarın veri/oturum etkisini değerlendirin |
| PostgreSQL parolası | DB rol parolası ile uygulama URL'sini birlikte güncelleme; sadece env yeterli değil |
| Domain | DNS + Dokploy domain + tenant/CORS/callback ayarları; Compose redeploy |
| SIP/AMI ayarı | Backend/Asterisk tutarlılığı; ilgili container yeniden oluşturma |
| Dental fast/full | Model hazırlığı + kaynak kontrolü + dental redeploy |

Sadece `restart` mevcut container'ın environment değerlerini değiştirmez. Dokploy üzerinden redeploy/recreate kullanın.

### 18.3 Kesintisizlik sınırı

Mevcut uygulamada ses oturumları, Asterisk çağrı eşlemesi ve SSE bağlantıları backend RAM'indedir. Dental job durumu da Python RAM'indedir. Backend cron her instance'ta çalışır; migration/seed geneli için dağıtık tekil çalıştırma garantisi yoktur.

Bu nedenle `replicas=2` veya `start-first` seçmek tek başına sıfır kesinti sağlamaz. Ölçekleme öncesi ortak oturum/iş depolaması, tekil cron/worker koordinasyonu, migration yönetimi, trafik/çağrı boşaltma ve route tutarlılığı tasarlanmalıdır. Bu rehberin çalışma varsayımı tek backend ve tek dental process'tir.

### 18.4 Geri dönüş

Önceki başarılı image/digest'i yeniden deploy etmek uygulama kodunu geri döndürür; veritabanını geri döndürmez. Yeni migration eski kodla uyumlu değilse bakım penceresinde doğrulanmış DB ve dosya kurtarma noktasına dönmek gerekir. Bunun yedekten sonraki veriyi kaybettireceğini hesaba katın.

Image tag'leri ve frontend dependency çözümü hareketli olduğu için eski commit'i yeniden build etmek önceki image'ı birebir üretmeyebilir. Çalışan image'ları release etiketi/digest ile koruyun. `docker compose down -v`, `docker volume prune` veya volume silmeyi deploy/rollback adımı olarak kullanmayın.

<a id="19-sorun-giderme"></a>
## 19. Sorun giderme

| Belirti | Muhtemel neden | Kontrol / çözüm |
|---|---|---|
| Backend build frozen lock hatası | Git'te lockfile yok veya manifestle uyumsuz | Bölüm 5.2; temiz checkout ve uyumlu Bun |
| `COPY data` / `COPY client` bulunamadı | Yanlış build context veya ignore kuralı | Backend/client için repository kökü |
| Frontend build çok yavaş / disk dolu | Kök context'e node_modules/.next/veriler dahil | Kök `.dockerignore`, disk ve build cache boyutu |
| `dokploy-network` bulunamadı | Yanlış sunucu veya eksik Dokploy ağı | Doğru deploy sunucusunda network inspect |
| Postgres `password authentication failed` | URL/env uyuşmazlığı veya eski volume parolası | Mevcut DB rolü, URL encoding, env değişikliği geçmişi |
| DB bağlantısı `5433` portuna gidiyor | Yerel `.env` production'a taşınmış | Host override yalnız hostu değiştirir; port 5432 olmalı |
| Yanlış veritabanı/Redis'e bağlanıyor | Ortak ağda genel veya mükerrer alias | Her stack'e özgü alias; override ve URL eşlemesi |
| `extension vector is not available` | Düz PostgreSQL image'ı | pgvector image/extension kurulumu |
| Backend sürekli restart | Migration/seed hatası | İlk entrypoint hatası; DB erişimi, extension ve schema |
| Backend healthy ama API çalışmıyor | Mevcut healthcheck HTTP status sınamıyor | Bölüm 10–11 DB/auth/işlev kontrolleri |
| Frontend 502 | Yanlış port veya backend DNS erişimi | Client target 3002; runtime `SERVER_URL`/`BACKEND_PROXY_URL` |
| API 404 / klinik bulunamadı | Domain DB'de yok veya proxy host yanlış | `clinic_domains`, shared proxy secret, host/proto |
| Girişte sürekli 401 | Yanlış parola, cookie veya session | İlk admin env aktarımı; cookie Secure/host; DB session |
| Env'deki yeni parola çalışmıyor | Seed mevcut kullanıcıyı güncellemiyor | Panel parola değiştirme akışı |
| Platform paneli görünmüyor | Host allowlist veya platform rolü | `PLATFORM_ADMIN_HOSTS`, kullanıcı ve klinik üyeliği |
| DICOM isteği localhost'a gidiyor | `NEXT_PUBLIC_API_URL` build arg eksik | Bölüm 7; frontend rebuild; çok domainde relative URL düzeltmesi |
| DICOM/logo redeploy sonrası kayıp | Upload/tenant-assets mount eksik | Eski dosyaları kurtarma ve doğru volume mount |
| AI model env'i etkisiz | Kod allowlist'i veya DB önceliği | `assistant-config.ts`; paneldeki mevcut ayarlar |
| Gemini 401/403/404/429 | Anahtar, yetki, model erişimi veya kota | Sağlayıcı yanıtı ve ilgili proje/hesap erişimi |
| RAG boş | Seed atlanmış, embedding başarısız | Knowledge kayıtları, embedding logları, 768 boyut uyumu |
| Calendar `redirect_uri_mismatch` | Google ve env callback uyuşmaz | Tam HTTPS callback URI |
| SIP register başarısız | Trunk bilgisi, IP whitelist, transport/firewall | `pjsip show registrations`; Netgsm hesabı |
| SIP kayıtlı ama ses yok/tek yönlü | Yanlış public IP veya RTP/NAT | SDP IP, UDP aralığı, cloud firewall |
| Telefon AI cevaplamıyor | `TELEPHONY_ENABLED` yanlış, 12000 erişimsiz veya AI hatası | Tam `1`, AudioSocket module/host, backend logu |
| Inbound çalışıyor, outbound/transfer bozuk | AMI host/parola veya caller ID | İki tarafta ortak secret, manager kullanıcı, trunk caller ID |
| Asterisk sürekli çöküyor, telefon kapalı sanılıyor | Ana Compose profile'sız başlatıyor | SIP alanlarını doldurun veya Bölüm 7.3 profiles |
| Dental 503 | Servis kapalı veya full model hazır değil | Frontend runtime URL, `/health` JSON, model indirme |
| Dental healthy ama job failed | Model/seri/bellek/timeout problemi | En az 16 kesit, `modelReady`, job error, container OOM |
| Dental job ID bulunamadı | Restart veya farklı replica | Tek instance; işi yeniden yükleme |
| Exit 137 / OOMKilled | Bellek limiti aşıldı | Client/backend/dental RAM, gerçek upload hacmi |
| WhatsApp QR oluşmuyor | Evolution URL/key/instance uyuşmazlığı | Ayrı Evolution logları ve panel yapılandırması |
| WhatsApp webhook 401/403 | Secret veya instance adı uyuşmuyor | VoiceAI'nin ürettiği webhook/instance ayarları |
| Entegrasyon şifresi açılamıyor | Encryption key eksik/değişmiş | Eski doğru 64 hex anahtarı geri yükleme |

Genel teşhis komutları:

```bash
dc ps
dc logs --tail=150 server client
dc logs --tail=100 postgres redis
docker stats --no-stream
df -h
docker system df
docker inspect --format '{{.State.Status}} OOM={{.State.OOMKilled}} Exit={{.State.ExitCode}}' CONTAINER_ID
```

`docker inspect` çıktısının tamamı environment sırlarını içerebilir; yukarıdaki sınırlı formatları kullanın. Logları paylaşmadan önce telefon numarası, hasta bilgisi ve credential içeriğini ayıklayın. `GEMINI_API_IP` gibi IP pinleme seçeneklerini rutin çözüm olarak kullanmayın; önce DNS/ağ erişiminin nedenini bulun.

<a id="20-kabul-kontrol-listesi-ve-kaynaklar"></a>
## 20. Kabul kontrol listesi ve kaynaklar

### 20.1 Kurulum tamamlandı kriterleri

- [ ] Bölüm 2'deki uygulanabilir engeller giderildi; kalan özellik kısıtları kaydedildi.
- [ ] Temiz checkout build'i ve beş zorunlu yerel kontrol başarılı.
- [ ] Dokploy Compose/Stack seçimi, Git sürümü ve build context doğru.
- [ ] DNS/HTTPS çalışıyor; client 3002, backend 3001 yönlendirmesi doğru.
- [ ] PostgreSQL `vector`/`pgcrypto`, Redis ve migration/seed doğrulandı.
- [ ] İlk yönetici özel bilgilerle oluşturuldu; bilinmeyen domain otomatik klinik sayılmıyor.
- [ ] Client/backend proxy secret aynı, domain-klinik eşlemesi doğru.
- [ ] Kalıcı Gemini anahtarı tarayıcıya/public endpoint'e verilmiyor; AI parse erişimi sınırlandırıldı.
- [ ] WAV, DICOM ve branding dosyalarının kalıcılığı redeploy ile sınandı.
- [ ] Panel login, listeleme, kayıt oluşturma ve geri okuma çalışıyor.
- [ ] Kullanılan Gemini modeli/hesap erişimi ve RAG işlevi doğrulandı.
- [ ] Telefon kullanılıyorsa SIP, iki yönlü ses, DID, AMI ve kayıt testi geçti.
- [ ] Dental kullanılıyorsa seçilen modda gerçek test serisi tamamlandı.
- [ ] Calendar/WhatsApp/SMS/e-posta yalnız yapılandırılan kliniklerde test edildi.
- [ ] Yedekler sunucu dışında saklanıyor; izole restore provası yapıldı.
- [ ] Önceki image, commit, environment ve kurtarma noktası kaydedildi.

### 20.2 Proje içi kaynak haritası

| Konu | Kaynak |
|---|---|
| Altı servis topolojisi | [`docker-compose.dokploy.yml`](../docker-compose.dokploy.yml) |
| Yerel profiller | [`docker-compose.yml`](../docker-compose.yml) |
| Backend build ve başlangıç | [`server/Dockerfile`](../server/Dockerfile), [`docker-entrypoint.sh`](../server/docker-entrypoint.sh) |
| Frontend build | [`client/Dockerfile`](../client/Dockerfile), [`next.config.ts`](../client/next.config.ts) |
| Örnek değişkenler | [`.env.example`](../.env.example); açıklamalarını güncel kodla birlikte değerlendirin |
| Migration ve başlangıç kullanıcısı | [`migrate.ts`](../server/src/db/migrate.ts), [`migrate-seed.ts`](../server/src/scripts/migrate-seed.ts), [`seed-users.ts`](../server/src/scripts/seed-users.ts) |
| HTTP, dosyalar, callback ve telephony register | [`server/src/index.ts`](../server/src/index.ts) |
| Proxy ve hostname | [`backend-request.ts`](../client/lib/backend-request.ts), [`forwarded-request.ts`](../client/lib/forwarded-request.ts), [`hostname.ts`](../server/src/tenancy/hostname.ts) |
| Direct session engeli | [`direct-session/route.ts`](../client/app/api/direct-session/route.ts), [`ai/parse/route.ts`](../client/app/api/ai/parse/route.ts) |
| Model seçimi | [`assistant-config.ts`](../server/src/services/assistant-config.ts) |
| WhatsApp ve şifreleme | [`api/whatsapp.ts`](../server/src/api/whatsapp.ts), [`integration-secrets.ts`](../server/src/services/integration-secrets.ts) |
| Asterisk | [`infra/asterisk/Dockerfile`](../infra/asterisk/Dockerfile), [`entrypoint`](../infra/asterisk/docker-entrypoint.sh), [`dialplan`](../infra/asterisk/templates/extensions.conf.tmpl), [`AMI`](../infra/asterisk/templates/manager.conf.tmpl) |
| Dental | [`Dockerfile`](../services/dental-segmentator/Dockerfile), [`app.py`](../services/dental-segmentator/app.py), [`download-model.py`](../services/dental-segmentator/download-model.py) |
| Netgsm ek notları | [`netgsm-integration.md`](netgsm-integration.md); yeni sunucuda kaynak kod ve gerçek trunk bilgileri önceliklidir |

Dokploy kurulumu, environment aktarımı, domain yönlendirmesi ve volume backup davranışı ilgili bölümlerde bağlantılanan resmî belgelerle kontrol edilmiştir. Uygulamaya özgü portlar, env farkları, dosya yolları ve sınırlamalar yukarıdaki repository kaynaklarından çıkarılmıştır.
