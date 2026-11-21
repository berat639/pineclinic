# Kişi Verisi Dışa Aktarma ve Silme (T-9.6)

Bir kişinin verisini dışa aktarmak, tamamen silmek veya anonimleştirmek için kullanılır. Yalnız `owner` ve `admin` rolleri kullanabilir; diğer roller 403 alır.

## Uç noktalar (`/api/tenants/{tenantId}/privacy`)

| Uç | Açıklama |
|---|---|
| `POST /contacts/{id}/export` | Küçük kişi: eşzamanlı paket + süreli indirme bağlantısı (200). Mesaj sayısı eşiği aşarsa arka plan işi (202). |
| `POST /contacts/{id}/erase` | Gövde: `{ "mode": "erase" \| "anonymize", "confirmIrreversible": true }`. Onay alanı yoksa veya `true` değilse 400. |
| `GET /requests`, `GET /requests/{id}` | Talep kayıtları ve durum. |
| `POST /requests/{id}/download-link` | Hazır paket için yeni indirme belirteci üretir. |
| `GET /requests/{id}/download?token=` | Paketi indirir (oturum + rol + belirteç + süre). |

Eşik `inlineMessageLimit` (varsayılan 2000 mesaj) ile ayarlanır. İş kuyruğu bağlı değilse dışa aktarma her zaman eşzamanlıdır.

## Dışa aktarma paketi

Türkçe başlıklı CSV dosyaları (`kisi`, `kimlikler`, `izinler`, `konusmalar`, `mesajlar`, `kayitlar`) ve makine okunur `paket.json`. Hücre başındaki `= + - @` karakterleri formül enjeksiyonuna karşı kaçırılır. Paket `data_requests.export_payload` içinde **bir saat** (`DOWNLOAD_TTL_SEC`) tutulur; belirteç yalnız özet (SHA-256) olarak saklanır. Kişi silinirse veya anonimleştirilirse önceki paketler de boşaltılır.

## Silme ve anonimleştirme kapsamı

| Depo | Tam silme | Anonimleştirme |
|---|---|---|
| `contacts` | silinir | ad, ek bilgi, etiket temizlenir; satır kalır |
| `contact_identities` | silinir | silinir |
| `contact_consents` | silinir | durum kalır, kaynak temizlenir |
| `conversations` / `messages` | silinir | satırlar ve sayaçlar kalır; mesaj metni ve içeriği, konuşma notları silinir |
| `records` (kişi numarasını taşıyan) | silinir | `pii` işaretli alanlar silinir, diğerleri kalır |
| `flow_sessions` | silinir | silinir |
| Redis oturum önbelleği | `flowcore:session:{kiracı}:{oturum}` anahtarları silinir (enjekte `clearSessionCache`; `REDIS_URL` varsa API bağlar) | aynı |
| `knowledge_faq_suggestions` | kişinin konuşmalarından türeyen öneriler silinir | aynı |
| `semantic_cache` ve gömme vektörleri | silinir (+ enjekte bellek önbelleği `purgeContact`) | aynı |

Bağlama kuralları: oturum, konuşma numarasıyla veya anlık görüntüdeki `contactId`/`conversationId` alanıyla eşleşir; kayıt, alanlarından birinin değeri kişi numarasına eşitse bağlı sayılır.

İşlem tek veritabanı işleminde yürür; başka kişi ve başka kiracı etkilenmez. Açık oturum veya bekleyen iş varsa silmeden **önce** `cancelPendingWork` kancası çağrılır; kanca hata verirse hiçbir şey silinmez (409). Önbellek temizliği de işlemin içindedir: başarısız olursa değişiklik geri alınır (503).

## `data_requests` kaydı

Kim (`requested_by`), ne zaman (`created_at`/`completed_at`), kapsam (`scope`: yalnız depo adları) ve sonuç (`result`: yalnız sayaçlar) yazılır. `contact_id` yabancı anahtar değildir; kişi silinse de kayıt kalır. Silinen içerik kayda kopyalanmaz.

## Anlamsal önbellek

`createPgSemanticCache(executor)` (`packages/ai/src/privacy/semantic-cache-pg.ts`) `semantic_cache` tablosunu kullanır. Gömme vektörü `jsonb` olarak saklanır (pgvector gerektirmez); benzerlik, kiracının son 500 kaydı üzerinde kosinüsle hesaplanır.

## Arka plan işi

`apps/api/src/privacy-jobs.ts` kuyruğa ekler, `apps/worker/src/privacy.ts` DBOS iş akışı olarak çalıştırır (`flowcore-privacy-export` kuyruğu). İş, talebi başlatan kullanıcının rolüyle kiracı bağlamında yürür.
