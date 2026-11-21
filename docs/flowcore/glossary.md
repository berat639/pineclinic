# FlowCore — Sözlük

## 1. Kod Terimleri (kodda kullanılacak sabit adlar)

| Terim | Anlam |
|---|---|
| Tenant | Müşteri organizasyonu (`tenantId`) |
| Workspace | Tenant altında proje/marka (`workspaceId`) |
| Agent | Persona + model + ses + bilgi tabanı kapsamı + kanallar + ana akış |
| Contact | Konuşulan kişi |
| EntityType / FieldDefinition / Record | Dinamik kayıt türü / bilgi alanı / kayıt (JSONB `data`) |
| Expression (Expr AST) | Koşul/hesap ifadesinin JSON ağacı |
| IR | Doğrulanmış, normalize, hash'li ara gösterim |
| Artifact | Derleyici çıktısı (hedef + içerik + hash), değiştirilemez |
| FlowVersion | Yayınlanmış, derlenmiş akış sürümü |
| ActionDefinition | `defineAction` ile kayıtlı işlem |
| ChannelAdapter | Kanal arayüzü |
| RealtimeModelAdapter | Gerçek zamanlı ses modeli arayüzü |
| WebVoiceTransport | Web ses bağlantı arayüzü (livekit / websocket) |

## 2. Arayüz Metin Eşlemesi (teknik → ekranda görünen)

| Teknik | Arayüzde |
|---|---|
| Node / Edge | Adım / Bağlantı |
| Flow | Akış |
| Agent | Asistan |
| Entity type / Field | Kayıt türü / Bilgi alanı |
| Record | Kayıt |
| Contact | Kişi |
| Condition / Expression | Koşul / Hesaplama |
| Action | İşlem |
| Intent | Müşterinin amacı |
| Codegen önizleme | Yayın Öncesi Kontrol |
| Publish / Version | Yayınla / Sürüm |
| Webhook (giden) | Dış sisteme bildir |
| HTTP request | Dış sistemden bilgi al |
| Embedding / Reindex | Bilgi tabanını güncelle |
| Chunk | Bölüm |
| API key / Secret / Token | Bağlantı anahtarı |
| MCP tool | Bağlı araç |
| Handoff | İnsana aktar |
| Transfer call | Aramayı aktar |
| Opt-out | Bildirimleri kapattı |
| Simulator | Deneme Ekranı |
| Latency / TTFA | Yanıt hızı |
| MOS | Ses kalitesi |
| Jitter / Packet loss | Bağlantı durumu |

## 3. Arayüzde Yasaklı Terimler

codegen, IR, AST, JSON, şema/schema, Zod, DDL, SDK, MCP, webhook, regex, token, embedding, chunk, vektör, node, edge, payload, API key, HMAC, SIP, cron, idempotent, değişken adları (snake_case / camelCase), `{{...}}`, `==`, `!=`, `>`, `<`, AND, OR.

Koşul bağlaçları yalnız "ve" / "veya". Değişkenler etiket çipi olarak gösterilir: `[Müşteri adı]`.
