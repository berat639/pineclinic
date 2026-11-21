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
