# Netgsm SIP Trunk → Gemini Live Entegrasyonu

Bu doküman, voice-AI sisteminin **gelen telefon çağrılarını** Netgsm üzerinden alıp,
Asterisk + AudioSocket köprüsü ile mevcut Gemini Live oturumuna nasıl bağladığını
ve sunucuda (`80.225.236.202`) nasıl ayağa kalktığını anlatır.

```
[Müşteri Telefonu]
       │  PSTN
       ▼
[Netgsm Numarası]
       │  SIP/TCP +90 prefix
       ▼
[Asterisk (Docker, port 5060/tcp + 10000-10200/udp)]
       │  AudioSocket SLIN 8 kHz
       ▼
[server/src/telephony — TCP :12000]
       │  upsample 8→16 kHz
       ▼
[Gemini Live (mevcut createLiveSession)]
       │  24 kHz PCM
       ▼  downsample 24→8 kHz
[Asterisk → Netgsm → Müşteri]
```

## 1. Netgsm tarafı (Online İşlemler)

> **Önkoşul:** Hesabınızda **"Ses Hizmeti / SIP Trunk"** aboneliği aktif olmalı.
> Bu hizmet HTTP API (SMS/OTP/sesli mesaj) aboneliğinden ayrıdır.

### 1.1 SIP Trunk bilgilerini al

1. [Netgsm Online İşlemler](https://onlineislem.netgsm.com.tr/) → giriş yap.
2. **Ses Hizmeti → Ayarlar → SIP Bilgileri → Detay** butonuna tıkla.
3. **Şifreyi Göster** → SMS ile doğrulama kodunu gir → **SIP Trunk parolasını** kaydet.
   - Kullanıcı adı: numaranın başında **0 olmadan** hali (örn. `3121234567`).
   - Parola: yukarıdaki adımda görüntülenen değer.

### 1.2 SIP Trunk hedefini sunucuya çevir

Aynı ekranda (SIP Bilgileri):

| Alan                  | Değer                       |
| --------------------- | --------------------------- |
| SIP Trunk Bilgileri   | `80.225.236.202`            |
| Port                  | `5060`                      |
| Protokol              | `TCP`                       |
| **Aranan Prefix**     | `+90`                       |

Kaydet → telefonunuza gelen doğrulama kodunu gir.

### 1.3 (Zaten yapıldı) HTTP API IP whitelist

API > IP Tanımlama'da `80.225.236.202` ekli olmalı. Bu sadece SMS/OTP/TTS REST
çağrıları içindir, SIP'i etkilemez ama opsiyonel SMS onay bildirimi için
gereklidir.

### 1.4 Netgsm kaynak IP'lerini al (firewall için)

SIP INVITE'larının sunucuya geleceği Netgsm-side IP'leri Netgsm destek
ekibinden öğrenip sunucu firewall'unda whitelist'leyin (UDP/TCP 5060).

## 2. Sunucu firewall + Dokploy

Dokploy host'unda açık olması gereken portlar:

```bash
# SIP signaling (TCP + UDP)
ufw allow 5060/tcp
ufw allow 5060/udp
# RTP medya akışı
ufw allow 10000:10200/udp
```

> **Önemli:** Dokploy network'ü bridge modunda — RTP NAT geçişi için
> `infra/asterisk/templates/pjsip.conf.tmpl` içindeki
> `external_signaling_address` ve `external_media_address` mutlaka
> `NETGSM_PUBLIC_IP` env'iyle render ediliyor olmalı.

## 3. `.env` ayarları (sunucuda)

Sunucudaki `.env`'e ekleyin (lokal `.env`'de `TELEPHONY_ENABLED=0` bırakın):

```dotenv
TELEPHONY_ENABLED=1
AUDIOSOCKET_PORT=12000

NETGSM_SIP_HOST=sip.netgsm.com.tr
NETGSM_SIP_PORT=5060
NETGSM_SIP_TRANSPORT=tcp
NETGSM_SIP_USER=3121234567
NETGSM_SIP_PASSWORD=<online-islemler-den-aldigin-sifre>
NETGSM_PUBLIC_IP=80.225.236.202
RTP_START=10000
RTP_END=10200
```

## 4. Deploy (sunucuda)

```bash
git pull
docker compose -f docker-compose.dokploy.yml up -d --build server asterisk
```

Doğrulama:

```bash
# Server'ın AudioSocket dinlediğini gör
docker compose -f docker-compose.dokploy.yml logs server | grep AudioSocket
# Çıktı: "AudioSocket: tcp://0.0.0.0:12000"

# Asterisk'in Netgsm'e register olduğunu gör
docker exec -it voiceai-asterisk asterisk -rx 'pjsip show registrations'
# State: Registered olmalı

docker exec -it voiceai-asterisk asterisk -rx 'pjsip show endpoints'
# netgsm-endpoint görünmeli
```

## 5. Canlı çağrı testi

1. Netgsm'den aldığın numarayı kendi cep telefonundan **+90** ile ara.
2. Sunucuda log'ları takip et:
   ```bash
   docker compose -f docker-compose.dokploy.yml logs -f asterisk server
   ```
3. Şunları görmelisin:
   - Asterisk: `Netgsm inbound: <cep no> -> <dahili>`
   - Server: `[tel_xxxxxxxx] AudioSocket bağlantısı açıldı`
   - Server: `[tel_xxxxxxxx] Gemini Live ready (phone)`
4. Telefonda Hyundai asistanının karşılama mesajını duymalısın. Konuştuğunda
   yanıt vermesi gerekir. Konuşma sonrası `data/recordings/phone_<id>_<ts>.wav`
   dosyası oluşur ve admin panelinde listelenir.

## 6. Sık karşılaşılan sorunlar

| Belirti                                          | Olası neden / çözüm                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pjsip show registrations` → `Rejected`           | `NETGSM_SIP_USER` veya `NETGSM_SIP_PASSWORD` yanlış. Online İşlemler'den şifreyi yeniden alın.                                        |
| Çağrı kuruluyor ama tek yönlü ses                 | RTP NAT problemi. `NETGSM_PUBLIC_IP` `.env`'de doğru mu? UDP 10000-10200 firewall'da açık mı?                                          |
| Çağrı düştü `Codec mismatch`                      | `pjsip.conf`'ta `allow=alaw,ulaw,slin,slin16` ekli. Netgsm panel'inde codec kısıtlaması varsa kaldırın.                               |
| Asterisk loglarında `chan_audiosocket missing`    | `etc/modules.conf`'ta `app_audiosocket.so` ve `res_audiosocket.so` yüklü mü? `andrius/asterisk:22-current` image'ı bu modülleri içerir. |
| Gemini'ye giden ses bozuk/cızırtılı               | `upsample8to16` doğrusal interpolasyon yapıyor. Çok yüksek SNR ortamlarda yeterli, yapıldığında telefon kalitesi yeterli olur.       |
| `TELEPHONY_ENABLED=0` ile çalıştırınca AudioSocket | Beklenen davranış — telephony açık değil. Sunucuda `=1` yapıp restart.                                                                |

## 7. SMS onay (opsiyonel, ikinci aşama)

`server/src/gemini.ts` içindeki `randevuOlustur` handler'ında, başarılı bir
randevu kaydından sonra Netgsm HTTP API'ye SMS fire-and-forget edebiliriz:

```
GET https://api.netgsm.com.tr/sms/send/get?usercode=...&password=...&gsmno=905XXXXXXXXX&message=...&msgheader=...
```

Endpoint için `NETGSM_API_USERCODE`, `NETGSM_API_PASSWORD`, `NETGSM_API_MSGHEADER`
env'leri (yine `.env.example`'da) gereklidir. Bu, mevcut planın dışında — ayrı
bir PR ile eklemeniz önerilir.

## 8. Mimari referansı

Eklenen/değişen dosyalar:

- `infra/asterisk/` — Dockerfile + entrypoint + pjsip/extensions/rtp templates.
- `server/src/telephony/audiosocket.ts` — frame parser + encoder.
- `server/src/telephony/resample.ts` — 8↔16↔24 kHz PCM yeniden örnekleme.
- `server/src/telephony/index.ts` — TCP listener + Gemini Live köprüsü.
- `server/src/index.ts` — `TELEPHONY_ENABLED=1` ile `startTelephony` entry.
- `docker-compose.yml` + `docker-compose.dokploy.yml` — `asterisk` servisi.
- `.env.example` — yeni NETGSM_SIP_* ve TELEPHONY_* değişkenleri.

Web istemcisi (`/ws`) akışı **değişmedi**; aynı `createLiveSession` ve aynı
`sessions` Map'i yeniden kullanılıyor. Admin SSE bildirimleri telefon çağrıları
için `channel: 'phone'` payload'u taşır.
