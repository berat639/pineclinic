# Dokploy konuşma takibi

Sunucu servisi yeniden dağıtıldıktan sonra telefon görüşmeleri stdout'a `[KONUSMA]` önekiyle tek satırlık JSON olarak yazılır. Yeni ortam değişkeni gerekmez.

Dokploy'da sunucu servisinin Logs ekranında `[KONUSMA]` arayın. Tek görüşme için `callId` değerine (ör. `tel_12345678`) göre filtreleyin. Aynı çağrının olaylarını `sequence` ile takip edin; eşzamanlı çağrılar birbirinden bağımsızdır.

- `timestamp`: ISO 8601 UTC saat, milisaniyeli (`Z` UTC anlamındadır; Türkiye saati üç saat ileridir).
- `elapsedMs`: TCP bağlantısı açıldıktan sonra geçen süre; sistem saati düzeltmelerinden etkilenmeyen monoton saat kullanılır.
- `speaker`: `arayan` veya `asistan`.
- `text`: sağlayıcıdan gelen konuşma metni parçası; boşluklar korunur, satır sonları JSON içinde kaçışlanır.
- `queuedAudioMs`: telefona gönderilmeyi bekleyen asistan sesinin süresi.
- `playbackActive`: asistanın ses kuyruğunun hatta gönderim durumu.

`arayan_sesi_algılandı` yerel ses algılamasıdır; gürültü de tetikleyebilir. `arayan_sesi_sustu` ve `arayan_ses_akışı_sonu_gönderildi` mevcut algılama modu bu sinyalleri ürettiğinde görünür.

`asistan_sesi_üretimi_başladı`, `asistan_sesi_hatta_başladı`, `asistan_üretimi_tamamlandı` ve `asistan_sesi_hatta_gönderimi_bitti` üretim ile telefon çıkışını ayırır. `asistan_sesi_tampon_bekliyor` kuyruk tükenmesini, `asistan_sözü_kesildi` ise iptal edilen kuyruk süresini gösterir.

Transkriptin zaman damgası metnin sunucuya ulaştığı andır. Sağlayıcı kelime bazlı ses zamanları vermediği için kelimelerin kesin söylenme/duyulma anı olarak yorumlanmamalıdır. Telefon çıkışı sunucunun Asterisk'e gönderimidir; RTP ve operatör gecikmesi dahil değildir. Kesilmiş asistan yanıtlarının metni, arayanın duymadığı sözcükleri de içerebilir.

Bu kayıtlar konuşma içeriğini içerir; mevcut Dokploy log erişimi ve saklama süresi uygulanır.

## Konuşma algılama düzeltmeleri

Telefon akışı asistan konuşurken de ilk heceler ve sessizlikler dahil sürekli iletilir. Yerel RMS algılaması araya girme kararını vermez; açıkça RMS filtresi seçilmişse süzülen kareler yerine sessizlik gönderilir. Yerel duraksamalar sürekli açık mikrofon için `audioStreamEnd` üretmez.

Telefonun anlamsal modunda başlangıç hassasiyeti düşük, başlangıç doğrulama süresi 300 ms ve varsayılan bitiş sessizliği 750 ms'dir. Anlamı yarım ifadelerde devamı bekleme ve başkasıyla konuşulurken sessiz kalma talimatları uygulanır. İletişim şikâyetleri konu dışı sayılmaz; bu ifadeler nedeniyle yapılan yanlış kapatma aracı çağrıları sunucuda da reddedilir. Açık kullanıcı kapatma talepleri korunur. Bunlar konuşma tanımanın her ses ortamında kusursuz olacağı anlamına gelmez.

Transkriptlerde `tr-TR` dil ipucu kullanılır. Sağlayıcının kesinti mesajıyla aynı pakette gelen arayan transkripti korunur. `konuşma_algılama_ayarları` olayı çağrının etkin ses ayarlarını; `responseAfterLocalSpeechEndMs` ilk asistan sesinin yerel ses kapısı kapanışından ne kadar sonra geldiğini gösterir. Bu değer kelime bazlı veya uçtan uca gecikme ölçümü değildir.

Doğrulama: 58 regresyon testi, sunucu/istemci TypeScript kontrolleri ve gerçek Gemini oturumu. Sentetik Türkçe sesle “Randevu almak istiyorum ama” ardından 1 saniye sessizlik, ardından “Önce bir şey sormam gerekiyor” gönderildiğinde yarım ifadeye erken yanıt alınmadı. Tam ses girdisi gönderildikten yaklaşık 1,5 saniye sonra yanıt başladı; bu tek denemenin sonucudur, operatör hattında süre garantisi değildir.

Dil ipucu ve yerleşik konuşma davranışı için kaynaklar: [Google Live API uygulama önerileri](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/best-practices), [Google Live API konuşma yetenekleri](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-gemini-capabilities).
