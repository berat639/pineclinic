# T-1.6 — Kanal, konuşma ve üyelik API'si

Bu kart Faz 1 çekirdeğini tamamlar. Kaynaklar
`apps/api/src/routes/{channel-connections,conversations,memberships}.ts`,
`packages/db/src/memberships.ts` ve `schema/invitations.ts` altındadır.
Mevcut httpOnly oturum, kaynak denetimi, Türkçe hata/destek kodu ve OpenAPI
kuralları bütün yeni uçlarda geçerlidir.

## Kanal bağlantıları

Önek: `/api/tenants/{tenantId}/channel-connections`.

| Yol / yöntem | İşlem |
|---|---|
| `GET /`, `GET /{id}` | Bağlantıları listele veya oku; kiracı üyeleri okuyabilir |
| `POST /` | Oluştur; sahip/yönetici |
| `PATCH /{id}` | Verilen alanları düzenle; sahip/yönetici |
| `DELETE /{id}` | Sil; sahip/yönetici, bağlı konuşmalar varsa 409 |

Girdi `workspaceId`, `name`, `type`, `provider`, isteğe bağlı `externalId`,
`status`, açık `config` ve yalnız yazılan `credentials` alanlarını kapsar.
Durumlar `unconfigured` (Bekliyor), `active` (Bağlı), `error` (Hata) ve mevcut
`disabled` (Devre dışı) değerleridir. Önceki durum adları korunmuştur.

Kimlik bilgileri aynı kiracı/bağlantı UUID'sine bağlanan AES-256-GCM ile
şifrelenir. Liste, detay, oluşturma, güncelleme ve hata yanıtında ne açık bilgi
ne şifreli zarf bulunur. SQL projeksiyonu bu alanı seçmez; yalnız
`hasCredentials` göstergesi ve `credentialStorageAvailable` döner.

`ENCRYPTION_KEY` eksik/geçersizse uygulama ve okumalar çalışır; kimlik bilgisi
yazma 503 ve sade açıklama üretir. Açık ayarlar değiştirilebilir ve
`credentials: null` ile mevcut bilgi temizlenebilir. Alanı PATCH'te vermemek
saklanan bilgiyi korur. Çalışma alanı/kanal türü/sağlayıcı/dış kimlik değişirken
saklanmış bilgi varsa açıkça temizleme veya yeni bilgi verme gerekir.

Kimlik bilgisi girişi 16 KiB, sekiz derinlik ve 1.000 JSON öğesiyle sınırlıdır;
erişimci, prototip anahtarı, seyrek/döngüsel girdi reddedilir. Açık ayarlar
bilinçli olarak `endpointUrl`, `webhookUrl`, `apiVersion`, `locale`,
`receiveMessages`, `sendMessages` alanlarıyla sınırlıdır. URL'ler HTTPS olmalı,
kullanıcı/parola, sorgu veya parça içermemelidir. Özel sağlayıcı sırları
`credentials` içine yazılır. Eski serbest ayarlardaki bilinmeyen alanlar da
yanıta taşınmaz.

## Konuşma ve mesaj okuma

Önek: `/api/tenants/{tenantId}`. Bütün üyelik rolleri okuyabilir. Bu kartta
yazma uçları yoktur; mesaj oluşturma kanal çalışanının sorumluluğudur.

| Yol | Sonuç |
|---|---|
| `GET /conversations` | Konuşma listesi |
| `GET /conversations/{id}` | Konuşma detayı |
| `GET /conversations/{id}/messages` | Konuşmanın sıralı mesajları |
| `GET /messages?conversationId={id}` | Aynı mesaj listesinin alternatif yolu |
| `GET /messages/{id}` | Mesaj detayı |

Liste yanıtı `{data, pagination: {limit, nextCursor}}` biçimindedir.
`limit` varsayılan 50, en çok 100'dür. Sonraki sayfada önceki `nextCursor`
değeri `cursor` olarak gönderilir; süzgeçler korunur.

Ortak süzgeçler `channel`, `channelConnectionId`, `contactId`, `from`, `to`;
konuşmada ayrıca `workspaceId`, `agentId`, `status`; mesajda `status`,
`direction`, `deliveryStatus` desteklenir. Tarihler saat dilimli ISO biçiminde
ve en çok altı kesir hanesiyle kabul edilir. Başlangıç/bitiş dahil edilir;
ters aralık ve geçersiz tarih 400 üretir.

Konuşmalar `created_at DESC, id DESC`, mesajlar konuşma içinde `sequence ASC`
sırasındadır. PostgreSQL mikrosaniyeleri imleçte korunur; JavaScript'in
milisaniyeye yuvarlaması sayfada kayıt atlatmaz. Eşit zamanlar UUID ile ayrılır.
Konuşma zaman indeksi ve mevcut mesaj sıra tekilliği bu sorguları destekler.

İmleç sürüm, kiracı, kaynak ve süzgeç özetiyle sınırlıdır. Başka kaynak/kiracı
imleci veya değiştirilmiş süzgeç 400 üretir. İmleç bir yetki belgesi değildir;
her sayfada oturum ve RLS yeniden uygulanır, konum yalnız parametreli SQL'e
girer. Kanal kimlik bilgileri veya serbest konuşma metadata'sı seçilmez;
mesajın kendi metin/zengin içerik gövdesi döner.

## Üyelikler ve davetler

| Yol / yöntem | İşlem |
|---|---|
| `GET /api/tenants/{tenantId}/memberships` | Sınırlı üye dizini |
| `PATCH /api/tenants/{tenantId}/memberships/{id}` | `{role}` ile rol değiştir |
| `DELETE /api/tenants/{tenantId}/memberships/{id}` | Üyeliği kaldır |
| `POST /api/tenants/{tenantId}/invitations` | `{email, role, ttlHours?}` ile davet oluştur |
| `GET /api/tenants/{tenantId}/invitations` | Gizli değer içermeyen davet listesi |
| `DELETE /api/tenants/{tenantId}/invitations/{id}` | Kullanılmamış daveti iptal et |
| `POST /api/invitations/accept` | Oturumdaki hesapla `{token}` davetini kabul et |

Yönetim sahip/yöneticiyle sınırlıdır. Sahip atama veya mevcut sahibi değiştirme
yalnız sahibe açıktır; yönetici kendisini ya da başkasını sahip yapamaz.
Organizasyonun son sahibi silinemez ve daha düşük role geçirilemez (409).

Yönetim işlemleri aynı kiracı için transaction kapsamlı advisory lock alır;
kilit aktör üyeliğindeki `FOR SHARE` kilidinden önce alınır. Böylece iki
sahibin eşzamanlı rol düşürmesinde kilit sırası tutarlı kalır ve sahip sayısı
sıfıra inmez. Yetki her işlemde güncel veritabanından okunur.

Üye dizini yalnız üyelik kimliği, kullanıcı kimliği, rol, ad, e-posta ve
oluşturma zamanını seçer. Diğer kullanıcıları okuyan bu sabit sorgu yalnız
doğrulanmış sahip/yönetici ve kilitli kiracı kapsamında çalışır; genel kullanıcı
RLS politikası genişletilmemiştir. Parola özeti veya oturum bilgisi seçilmez.

Davet anahtarı 256 bit rastgeledir; veritabanında yalnız SHA-256 özeti
`membership_invitations` tablosunda saklanır. Süre varsayılan 24 saat,
en çok 168 saattir. Daveti oluşturan kişiye anahtar yalnız oluşturma yanıtında
bir kez verilir (`data.token`); liste/kabul/iptal/hata yanıtında dönmez ve
loglanmaz. Bu, paylaşılabilir davet oluşturmak için gereken tek seferlik
çıktıdır; oturum anahtarları ve kanal kimlik bilgileri bu istisnaya girmez.
E-posta gönderimi otomatik yapılmaz.

Kabul için giriş yapılmış olmalı ve hesabın normalize edilmiş e-postası
davetle eşleşmelidir. Daveti verenin güncel yönetim/sahip yetkisi tekrar
denetlenir. Süre, iptal ve tek kullanım koşulları aynı transaction'da atomik
güncellemeyle korunur. Davet mevcut bir üyeliğin rolünü değiştirmez; 409 döner.
Kullanılmış davet, üye sonradan kaldırılsa da yeniden kullanılamaz.

## Migrasyon ve kabul

Yeni tenant/RLS davet tablosuyla çekirdek şema **25 tablo** oldu. Şema üretimi,
idempotent migrasyon ve başlangıç onarımı günceldir. Yeni zorunlu ortam
değişkeni yoktur.

`bun run verify:t1.6`, yeni geçici PostgreSQL veritabanı ve gerçek HTTP
sunucusuyla kabulü tekrarlar. Şema/erişim kurulumu iki kez çalışır. Şifreli
saklama ve yanıtlarda sıfır kimlik bilgisi, tenant RLS, mikrosaniyeli konuşma
imleci, sıralı mesajlar, e-posta bağlı/tek kullanımlık/süreli davet ve iki
sahibin gerçek eşzamanlı rol düşürmesi doğrulanır. Geçici veritabanı ve sunucu
temizlenir. Son test/lint/derleme sayıları [ilerleme kaydındadır](progress.md).
