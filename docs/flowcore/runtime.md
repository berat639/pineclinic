# Faz 4 — Akış çalışma zamanı

Kaynaklar: `packages/runtime/src`, `apps/worker/src`, `packages/db/src/schema/sessions.ts`.

## Motor ve olay sözleşmesi

`FlowEngine` derlenmiş ve özeti doğrulanmış bir durum makinesi yükler.
`accept({id, revision?, fields?, intent?, ...})` sonucunda `revision`, `fields`,
`next`, `completed`, `completedActions` ve o turda oluşturulan `messages` döner.
`snapshot()` kalıcı JSON durumunu, `pending()` paralel dallardaki bütün bekleyen
adımları verir. Aynı motor örneğindeki olaylar sırayla yürütülür.

Olay kimliği oturum kapsamında tekildir. Tekrarında özgün olayın sonucu
`replayed: true` ile döner; daha yeni durum geriye alınmaz ve işlem yeniden
çalıştırılmaz. Olaydaki isteğe bağlı `revision` eskiyse değişiklik reddedilir.
Tamamlanmış oturumdaki yeni olay durumu değiştirmez. Geçersiz devam anahtarı,
erken zamanlayıcı dönüşü ve başka sürüme ait durum kapalı biçimde reddedilir.

| Adım | Davranış |
|---|---|
| Start, Message, End | Başlatma, anahtarla tekilleştirilen mesaj ve tamamlanma |
| CollectField | Boş/geçersiz değerde yeniden sorma; ifade ve konak doğrulaması |
| Condition, IntentRouter, Goto | Öncelikli çoklu koşul, amaç ve yönlendirme |
| Action | Kısa işlem kancası; `metadata.durable` veya `longRunning` ile dayanıklı iş |
| AiAgent, AgentHandoff | Kiracı/oturum kimliği taşıyan konak kancası; kanca yoksa dış olay bekleme |
| Subflow | Alt makineyi çözümleme, duruma gömme ve aynı makineyle devam |
| Wait | Süreli bekleme; mutlak son tarih ve erken dönüş koruması |
| WaitForEvent, HumanApproval | Adlandırılmış olay veya onay/ret/zaman aşımı dalları |
| Loop | Sınırlı liste üzerinde ayrı öğe kapsamları ve `done` çıkışı |
| Parallel | Eşzamanlı dallar, bütün dalları bekleme ve çelişen bilgi güncellemelerini reddetme |

Döngü gövdesi `body`/`loop` bağlantısından veya `metadata.bodyStepId` üzerinden
seçilir; gövdenin ana döngüye dönmesi bir yinelemeyi bitirir. Öğeye kancalarda
`request.item`, koşullarda `loop.item` üzerinden erişilir. Paralel dallar
`parallelBranches` ile belirtilir; dallar bittikten sonra ana adımın `next`
çıkışından devam edilir. İşlem çıktısı `metadata.outputField` ile saklanabilir.

Alt akış çözümleyicisi `resolveSubflow(key, request)` kiracı/oturum bilgilerini
alır. Konak aynı oturum ve anahtar için değişmez bir sürüm döndürmelidir;
yeniden denemede değişebilen etkin sürümü seçmemelidir. Çözülen makine duruma
gömüldükten sonra yeniden yüklemede çözümleyici çağrılmaz.

## Kalıcı oturum ve Redis

`createRuntimeSessionService({store, machines, hooks})` yayımlanmış etkin
sürümden oturum oluşturur. Devam eden oturum her turda kendi `flowVersionId`
değeriyle yüklenir; yeni yayın veya geri alma onu değiştirmez.
`createPostgresMachineLoader` kiracı rolünde sorgular, saklanan IR'yi yeniden
doğrular ve derlenen makine özetini yayımlanan özetle karşılaştırır.

`flow_sessions` tablosu kiracı, değişmez akış sürümü, makine özeti, revizyon,
JSON durum, durum özeti ve tamamlanma bilgisini saklar. Bileşik yabancı anahtar
ve RLS başka kiracının sürümüne bağlanmayı engeller. Çekirdek şema 19 tablodur;
mevcut idempotent migrasyon ve başlangıç onarımı yeni tabloyu da kapsar.

PostgreSQL yetkili kaynaktır. Her turda transaction kapsamlı oturum kilidi,
yeniden okuma ve beklenen revizyonla atomik kayıt yapılır. Makine sorgusu
kilit alınmadan önce çalışır; böylece eşzamanlı oturumlar aynı havuzdan ikinci
bağlantıyı bekleyerek havuzu kilitlemez. Veritabanına yazan kancalar için
`hooks: ({transaction, tenantId, sessionId}) => ({...})` kurucusu kullanılır.
Buradaki `transaction` aynı kiracı rolüne ve kilitli bağlantıya sahiptir;
işlem etkisi ve checkpoint birlikte commit veya rollback olur. Bu bağlantı
yerine aynı dolu havuzdan ikinci bağlantıyı isteyen kancalar yazılmamalıdır.

Redis isteğe bağlıdır. Önce PostgreSQL başlığı okunur; önbellek ancak kiracı,
sürüm, revizyon, tamamlanma ve SHA-256 durum özeti eşleşirse kullanılır.
Bozuk/eski veri veya bağlantı hatası PostgreSQL'e döner. Önbelleğe yazma yalnız
commit sonrasında yapılır; geri alınmış durum yayımlanmaz. Süre aşımı
varsayılanı 100 ms, önbellek ömrü 300 saniyedir.

Durum sınırları 1 MiB, 64 derinlik ve 100.000 JSON öğesidir. Motor turu
varsayılan 1.000 adımla ve oturum 10.000 olayla sınırlıdır; geçmiş sessizce
silinerek tekilleştirme bozulmaz. Sınıra ulaşınca sade hata üretilir.

## Dayanıklı işler

DBOS Transact 5.4.0, Bun 1.3.13 üzerinde gerçek PostgreSQL ile çalışır;
Node.js'e geçiş gerekmedi. Ses turunun kısa hesaplamaları motorda kalır.
Zamanlayıcı, olay bekleme, insan onayı ve uzun işlemler ayrı işlerde yürür.

`launchDurableWorker()` dönen nesnede `start`, `run`, `signal` ve `shutdown`
bulunur. İş kimliği kiracı, oturum ve bekleme anahtarından türetilir. Aynı
kimlikle farklı görev göndermek reddedilir; JSONB nesne anahtarı sırası
görevi değiştirmiş sayılmaz. İşaretler kiracı/oturum ve beklenen olay türüyle
doğrulanır; aynı olayın tekrar gönderilmesi tekilleştirilir.

`service.runPending(scope, (owner, request) => worker.run(owner, request))`
bütün bekleyen dayanıklı dalları başlatır ve sonuçları aynı oturuma sabit
olay kimlikleriyle iletir. Uzun bekleme sırasında oturum kilidi tutulmaz.
Bu köprü çökmeden sonra yeniden çağrılabilir.

Uzak servis işlemleri sağlanan `idempotencyKey` değerini uygulamalıdır.
Uzak etkiyle yerel checkpoint arasında atomik transaction yoktur; çökmede
çağrı yeniden denenebilir. Kabul testi özellikle bu aralıkta süreci kapatır:
iki çağrı denemesi olur, sağlayıcı anahtarı sayesinde tek kalıcı etki kalır.
Bu güvence anahtarı uygulamayan rastgele bir uzak servise genişletilmez.

Yeni zorunlu ortam değişkeni yoktur. Worker mevcut `DATABASE_URL` ve
`POSTGRES_HOST_OVERRIDE` ayarlarını kullanır. Bağlantı açılışında 60 saniyelik
boş transaction sınırı PostgreSQL başlangıç seçeneğine taşınmıştır; DBOS'un
beklenmeden gönderdiği açılış sorgusunun `pg` uyarısı böylece giderilmiştir.
Açıkça verilmiş bağlantı seçenekleri korunur.

Servis sınırı önemlidir: çalışma zamanı depolarına verilen `tenantId`, oturum
veya kanal doğrulamasından elde edilmelidir. Bu servis API'leri kullanıcı
üyeliğini yeniden doğrulayan HTTP uçları değildir. Dış model/kanal/işlem
sağlayıcılarının bağlantıları sonraki fazların konusudur.

## Tekrarlanabilir kabul

`bun run verify:phase4` iki ayrı geçici PostgreSQL veritabanında motor/DBOS
köprüsünü ve gerçek `SIGKILL` sonrası kurtarmayı çalıştırır. Var olan uygulama
verisi sıfırlanmaz; geçici süreç ve veritabanları kapanışta temizlenir.

Redis dahil denetim için yalnız teste ayrılmış bir Redis adresi verilir:

```sh
bun run verify:phase4 --redis-url redis://127.0.0.1:6389
```

Denetim 13 oturumu, havuz kapasitesini aşan 12 eşzamanlı oturumu, eski olay
tekrarını, eski revizyon reddini, başka kiracı erişimini, yeni yayından sonra
sürüm sabitlemeyi ve DBOS üzerinden olay/uzun işlem dönüşünü kapsar. Ayrı
kurtarma denetimi işlem yazıldıktan fakat DBOS checkpoint'i oluşmadan önce
süreci `SIGKILL` ile kapatır; yeniden başlatınca beş iş tamamlanmalı ve işlem
iki kez denenmesine rağmen tek kalıcı etki bulunmalıdır.
