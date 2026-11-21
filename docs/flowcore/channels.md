# Mesaj Kanalları (Faz 7)

Bu belge kanal katmanının sözleşmesini, güvenlik kurallarını ve çalışma akışını anlatır.

## Katmanlar

| Katman | Yer | Görev |
|---|---|---|
| Sözleşme | `packages/channels/src/{types,util,registry}.ts` | `ChannelAdapter`, olay ve mesaj tipleri, ortak yardımcılar (zamanlama güvenli karşılaştırma, telefon, vazgeçme algılama, 24 saat penceresi) |
| WhatsApp | `packages/channels/src/whatsapp/**` | `evolution`, `n8n-meta`, `meta-cloud` |
| Telegram | `packages/channels/src/telegram/**` | `bot-api` (gizli anahtarlı webhook, satır içi klavye, sesli not, akış) |
| Web sohbet | `packages/channels/src/web/**` | Ziyaretçi belirteci, widget çerçeveleri, hub, SSE, simülatör, hız sınırı |
| Çalışan | `packages/runtime/src/conversation-worker.ts` | Vazgeçme, yapay zekâ duraklatma, seri işleme, araç döngüsü sınırı (8), kullanım kaydı |
| Depo / alım | `packages/runtime/src/conversation-{store,ingest}.ts` | Kişi + konuşma + mesaj kaydı, tekilleştirme, kiralamalı kilit, teslim durumu |
| Gelen Kutusu | `packages/runtime/src/conversation-inbox.ts` | Üstlen, geri ver, ata, durum, okundu, etiket, insan yanıtı |
| İş sırası | `apps/worker/src/conversation.ts`, `apps/api/src/conversation-jobs.ts` | DBOS kuyruğu `flowcore-conversation-turn` |

## Sözleşme

Her adaptör `verifyWebhook`, `parseWebhook` ve `send` sağlar. `parseWebhook` bilinmeyen veya bozuk yükte hata
fırlatmaz, boş liste döner. `send` hataları `ChannelError` ile gelir; `uncertain` ise mesaj gitmiş olabilir ve
**asla körlemesine yeniden denenmez** (çalışan yapay zekâyı duraklatır, kanaldan kontrol istenir).

## Güvenlik

- İmza ve gizli anahtar karşılaştırmaları `safeEqual` (zamanlama güvenli) ile yapılır.
- Meta: `x-hub-signature-256`; n8n: zaman damgalı HMAC (5 dakika); Evolution ve Telegram: en az 32 / geçerli karakterli gizli anahtar.
- Dış adresler (Evolution, n8n, Telegram özel sunucu) `validateSafeOutboundUrl` ile korunur (SSRF).
- Gizli bilgiler günlüklere ve yanıtlara yazılmaz; hata iletileri sağlayıcı yanıtı içermez.
- Kimlik bilgileri `channel_connections.credentials` içinde şifreli tutulur; şifreleme anahtarı yoksa kayıt kapalıdır (D-12).

## Çalışma akışı

1. Webhook gelir → doğrulanır → olaylara çevrilir.
2. Kişi mesajı `ingestMessage` ile kalıcı yazılır (aynı sağlayıcı mesajı ikinci kez yazılmaz) ve iş kuyruğuna eklenir.
3. DBOS işi konuşma kilidini (süreli kiralama) alır; alamazsa yeniden dener, mesaj kaybolmaz.
4. Çalışan sırayla: vazgeçme → duraklatma/devir denetimi → yanıt üretimi → "gönderiliyor" işaretini **önce** yazma → gönderim → giden mesaj kaydı.
5. Teslim durumu olayları yalnız ileri doğru işler (gönderildi → iletildi → okundu).

## Kota kancası

LLM ve gömme çağrıları `recordUsage` (`@flowcore/core`) üzerinden geçer. Alıcı tanımlı değilse hiçbir şey olmaz;
T-11.3 kotası bu noktaya bağlanır.

## Uç noktalar

| Uç nokta | Kimlik | Görev |
|---|---|---|
| `GET/POST /api/webhooks/channels/{kiracı}/{bağlantı}` | İmza / gizli anahtar | Sağlayıcı webhook'u; bilinmeyen, kapalı ve yabancı kiracı bağlantısı aynı 404'ü verir |
| `POST /api/web-chat/{kiracı}/{bağlantı}/session` | Kaynak izni | Ziyaretçi belirteci üretir |
| `POST .../messages`, `GET .../events` | Ziyaretçi belirteci | Mesaj gönderir; yanıtları SSE ile `messages` tablosundan izler (`Last-Event-ID` ile devam) |
| `POST /api/tenants/{kiracı}/inbox/conversations/{id}/{take-over,release,assign,status,read,tags,reply}` | Oturum + rol (düzenleyen ve üstü) | Gelen Kutusu işlemleri |
| `GET /api/tenants/{kiracı}/inbox/events` | Oturum (izleyici dahil) | Canlı güncelleme akışı |

Web sohbet bağlantısı oluşturulurken ziyaretçi anahtarı otomatik üretilir ve şifreli saklanır; `allowedOrigins`
ayarı ile izinli kaynaklar belirlenir. Şifreleme anahtarı yoksa web sohbet kapalıdır (sade uyarı).

## Yineleme ve kurtarma

Sağlayıcı aynı mesajı yeniden gönderirse ikinci kayıt oluşmaz. Mesaj hâlâ bekliyorsa iş aynı iş kimliğiyle yeniden
sıraya alınır; böylece ilk sıraya alma başarısız olsa bile mesaj kaybolmaz ve çift işlem oluşmaz.

## Bilinçli sınırlar

- Yapay zekâ yanıt üreticisi (`ReplyGenerator`) Faz 9'da bağlanır; çalışan bunu dışarıdan alır.
- Simülatör taşıyıcısı hazırdır; Deneme Ekranı uç noktası T-10.12 ile bağlanır.
- Web görüşme KVKK / kayıt onayı ertelenmiştir (plan Bölüm 8).


## Telegram webhook kaydı

Telegram bağlantısı kaydedilince, etkinleştirilince veya bilgileri değişince API `getMe` ile belirteci doğrular ve `setWebhook` ile `${PUBLIC_BASE_URL}/api/webhooks/channels/{tenantId}/{connectionId}` adresini gizli anahtarla kaydeder; pasifleştirme/silmede `deleteWebhook` çağrılır. `PUBLIC_BASE_URL` opsiyoneldir, https olmalı ve genel bir adres olmalıdır; yoksa durum `skipped` olur. Sonuç yanıtta `webhookStatus` (`registered | removed | skipped | failed`) ve Türkçe `webhookMessage` olarak döner; Telegram hatası bağlantı kaydını bozmaz. Elle yeniden deneme: `POST /api/tenants/{tenantId}/channel-connections/{id}/register-webhook` (yalnız owner/admin).
