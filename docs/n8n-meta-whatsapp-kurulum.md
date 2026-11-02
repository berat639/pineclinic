# n8n ile Resmi Meta WhatsApp Cloud API Kurulum Rehberi

Bu rehber, mevcut **Evolution API (QR)** yapısını bozmadan kliniğiniz için **n8n köprüsü üzerinden resmi Meta WhatsApp Business Cloud API** bağlantısını 5 adımda kurmanızı sağlar.

---

## Mimari Özeti

```
Hasta WhatsApp ──► Meta Cloud API ──(Webhook)──► n8n (Inbound Workflow)
                                                     │  HMAC-SHA256 İmzalı POST
                                                     ▼
                                     VoiceAI (/api/whatsapp/n8n/:clinicId/inbound)
                                                     │
                                     FlowEngine + RAG + Gemini Yanıt Üretimi
                                                     │
                                                     ▼
                                     24 Saatlik Pencere Kontrolü
                                      ├─ Pencere Açık (<24s): Serbest Metin (mode="text")
                                      └─ Pencere Kapalı (>24s): Onaylı Şablon (mode="template")
                                                     │
                                                     ▼
                                     n8n (Send Workflow) ──► Meta Graph API
```

---

## Adım 1 — Meta Business Suite Hazırlığı

1. [Meta for Developers](https://developers.facebook.com/) üzerinde **Business** tipinde bir uygulama oluşturun ve **WhatsApp** ürününü ekleyin.
2. **Business Settings > Users > System Users** menüsünden bir **System User (Admin)** oluşturun.
3. Bu kullanıcıya WhatsApp Business Account (WABA) yetkisi verip `whatsapp_business_messaging` ve `whatsapp_business_management` izinleriyle **kalıcı (permanent) Access Token** üretin (`META_ACCESS_TOKEN`).
4. **WhatsApp > API Setup** sayfasından **Phone Number ID** (`META_PHONE_NUMBER_ID`) değerini not alın.
5. **WhatsApp Manager > Message Templates** ekranından 24 saatlik pencere dışı bildirimler için en az bir onaylı şablon (ör. `randevu_hatirlatma`, dil: `tr`) oluşturun.

---

## Adım 2 — n8n Servisini Ayağa Kaldırma (İsteğe Bağlı Docker)

Mevcut bir n8n sunucunuz yoksa proje kök dizinindeki `docker-compose.n8n.yml` ile başlatabilirsiniz:

```bash
docker compose -f docker-compose.yml -f docker-compose.n8n.yml up -d
```

n8n ortam değişkenlerine aşağıdaki değerleri tanımlayın:

- `VOICEAI_BASE_URL`: VoiceAI sunucu adresiniz (ör. `https://api.ornekklinik.com` veya iç ağda `http://server:3001`)
- `VOICEAI_CLINIC_ID`: Klinik UUID'niz (Entegrasyonlar sekmesinde gösterilir)
- `VOICEAI_N8N_SECRET`: Entegrasyonlar sekmesindeki **n8n + Meta WhatsApp Cloud API** kartından üretilen HMAC sırrı
- `META_VERIFY_TOKEN`: Meta Webhook doğrulaması için belirlediğiniz rastgele dize
- `META_PHONE_NUMBER_ID`: Meta Phone Number ID
- `META_ACCESS_TOKEN`: Meta System User kalıcı token'ı

---

## Adım 3 — Hazır n8n Şablonlarını İçe Aktarma

`deploy/n8n/` klasöründeki 3 hazır JSON şablonunu n8n arayüzünden (**Workflows > Import from File**) içe aktarın ve **Active** konuma getirin:

1. `deploy/n8n/voiceai-meta-whatsapp-inbound.json` — Meta webhook doğrulaması (`GET`) ve gelen mesajları HMAC-SHA256 ile imzalayıp VoiceAI'a ileten akış (`POST`).
2. `deploy/n8n/voiceai-meta-whatsapp-send.json` — VoiceAI'dan gelen `text`, `template` ve `location` isteklerini Meta Graph API'ye (`v21.0/{phoneNumberId}/messages`) gönderen akış.
3. `deploy/n8n/voiceai-meta-whatsapp-status.json` — Meta teslimat durumlarını (`sent`, `delivered`, `read`, `failed`) VoiceAI'a ileten akış.

---

## Adım 4 — Meta Webhook Bağlantısı

1. Meta Developer Console > **WhatsApp > Configuration > Webhook** bölümüne gidin.
2. **Callback URL** olarak n8n Inbound workflow'unuzun Production URL'sini girin (ör. `https://n8n.ornekklinik.com/webhook/meta-whatsapp-inbound`).
3. **Verify Token** alanına `META_VERIFY_TOKEN` değerini girip **Verify and Save** butonuna tıklayın.
4. **Webhook fields** altından `messages` aboneliğini aktif edin.

---

## Adım 5 — VoiceAI Yönetim Panelinden Aktifleştirme

1. VoiceAI Yönetim Paneli > **Entegrasyonlar** sekmesine gidin.
2. **n8n + Resmi Meta WhatsApp Cloud API** kartında:
   - **Aktif Sağlayıcı** olarak `n8n + Meta Cloud API (Resmi)` seçeneğini işaretleyin.
   - **n8n Gönderim Webhook URL** alanına `voiceai-meta-whatsapp-send` workflow'unuzun Production URL'sini yapıştırın (ör. `https://n8n.ornekklinik.com/webhook/voiceai-whatsapp-send`).
   - **Meta Phone Number ID** alanını doldurun.
   - 24 saatlik pencere dışı gönderimler için onaylı Meta şablon adınızı (ör. `randevu_hatirlatma`, `tr`) ekleyin.
   - **Kaydet** butonuna basın ve **Bağlantıyı Test Et** ile n8n erişimini doğrulayın.
3. Dilediğiniz zaman veri kaybı olmadan **Evolution API (QR)** ve **n8n + Meta Cloud API** arasında geçiş yapabilirsiniz.

