# İfade dili — sözleşme ve referans yorumlayıcı

Kaynaklar `packages/ir/src/expr/` altındadır. AST, T-2.1'de oluşturulmuş
`kind` ayrımlı JSON sözleşmesini korur. `parseExpr` ve `exprSchema` bilinmeyen
alanları, geçersiz işleçleri, tehlikeli yolları, erişimci özellikleri, döngüleri
ve sınırı aşan girdileri reddeder. Referans yorumlayıcı `evaluate(ast, ctx)`
sonraki derleyici çıktılarının karşılaştırılacağı doğruluk kaynağıdır.

## Yorumlayıcı değerleri ve davranış

Bağlam `values` içindeki iç içe veya tam yolla anahtarlanmış verileri ya da
güvenilir `get(path)` işlevini sağlayabilir. Yalnız sahip olunan veri özellikleri
okunur; getter, prototip zinciri ve özel nesne anahtarları takip edilmez.
Liste koşulundaki `item` bağlam verisinden değil, en yakın liste öğesinden gelir.
İç içe liste bitince dış öğe bağlamı korunur. Liste dışında `item` eksiktir.

| İşlem | Davranış |
|---|---|
| `literal`, `ref` | Doğrulanmış JSON sabiti veya güvenli bağlam başvurusu. |
| `eq`, `neq` | Metin kırpma/Türkçe harf katlama, tanınan boolean eşdeğerleri, sonlu sayısal değerler ve yapısal JSON karşılaştırması. Eksik değerle karşılaştırma kapalı sonuç verir. |
| `gt/gte/lt/lte`, `between` | Sonlu sayı; sayısal metinde ondalık virgül desteklenir. Aralık iki sınırı sıralayıp dahil ederek karşılaştırır. |
| `in` | Liste üyeliği; kaynak uyumu için virgül/noktalı virgül/dikey çizgi ayrımlı metin listesi de kabul edilir. |
| Metin işlemleri | İçerme/başlama/bitme Türkçe harf katlamasıyla; `matches-safe` sınırlı güvenli desenle çalışır. |
| `and/or/not` | Kısa devre; yalnız boolean veya tanınan doğru/yanlış eşdeğerleri mantık değeri sayılır. |
| `exists`, `isEmpty` | Varlık null/eksik olmamayı; boşluk null/eksik, boş metin, boş dizi veya boş nesneyi denetler. |
| `any/all/len` | Yoğun, sınırlandırılmış listeler; öğe koşulunda en yakın `item`. Boş listede `any` yanlış, `all` doğrudur. |
| `intent` | Bağlamdaki amaç sonucu; etiket Türkçe harf katlamasıyla bulunur. |
| `semanticMatch` | Güvenilir, eşzamanlı callback gerekir. Callback yoksa eşik sıfır olsa bile yanlış sonuç verir. |

Doğru eşdeğerleri `true/evet/1/var`, yanlış eşdeğerleri
`false/hayır/hayir/0/yok` değerleridir. Eksik sayının sıfır sayılması gibi eski
davranışlar taşınmamıştır: boş, bozuk veya sonlu olmayan sayısal girdi
karşılaştırmayı geçemez. Kaynak operatörlerin olumlu testleri, sektör terimleri
ayıklanmış örneklerle korunur. Yorumlayıcı JavaScript'in genel truthy/falsy
kurallarını kullanmaz.

## Saat ve işlevler

`now`, `lower`, `upper`, `len`, `daysBetween`, `addDays`, `round` desteklenir.
`now` aynı değerlendirmede bir kez yakalanır; test/iş çağrısı sabit Date veya
eşzamanlı saat işlevi sağlayabilir. Harf dönüşümleri Türkçe, metin uzunluğu
Unicode kod noktalarıyla hesaplanır. Tarihler ISO takvim doğrulamasından geçer;
31 Şubat gibi taşarak normalize olan tarihler reddedilir. Tarih işlevleri UTC
zamanlarıyla ve 24 saatlik gün farkıyla çalışır. İşletmenin yerel mesai hesabı
ayrı sistem bağlamı kartında ele alınır. `round` hassasiyeti 0–12 aralığındadır.

## Güvenli desenler

`safe-regex.ts` atomlardan oluşan sınırlı bir dil ayrıştırır. Sabit karakter,
nokta, karakter sınıfı, izinli kaçışlar, başlangıç/bitiş çıpaları ve tek atomda
`*`, `+`, `?`, `{n}` tekrarları desteklenir. Grup, alternatif, geri başvuru,
ileri/geri bakış ve belirsiz tekrar aralıkları desteklenmez. AST'de desen
çalışma anında üretilen bir başvuru değil, doğrulanabilir metin sabiti olmalıdır.

Tam tekrarlı desen yerleşik geri izleyen RegExp motoruna verilmez. Yalnız tek
atom üyeliği motorla sınanır; NFA durumları metin üzerinde ilerletilir ve
çıpasız aramalar için yeni başlangıç durumu her karakterde eklenir. Böylece
yan yana yıldızların üstel geri izlemesi oluşmaz. `$` gerçek girdi sonunu ifade
eder; JavaScript'in son satır sonundan önce eşleşebilme istisnası taşınmaz.
Doğrudan eşleştirici boş deseni boş eşleşme sayar; ifade `matches-safe` işlemi
kaynak uyumu için boş desende yanlış sonuç verir.

## Ortak bütçeler ve güvenilir callback sınırı

Doğrulama sınırları 64 derinlik, 10.000 düğüm/değer, 120 karakter sabit metin,
64 karakter desendir. Yorumlayıcı tek çağrıda ortak ziyaret, liste öğesi, metin,
veri işi ve desen adımı bütçelerini uygular; iç içe koşullar yeni bütçe açmaz.
Üst sınırlar yalnız daha küçük seçeneklerle değiştirilebilir. Fazla çalışma
`EVALUATION_LIMIT`, geçersiz bağlam `INVALID_CONTEXT` kodlu sade hata verir.

Bağlam sağlayıcıları güvenilir sunucu işlevleridir. Yorumlayıcı bu işlevleri
işletim sistemi sandbox'ında çalıştırmaz ve callback'in kendi CPU/ağ işini
önceden kesemez. Asenkron sonuçlar kabul edilmez; reddedilmiş Promise sonucu
gözlemlenerek işlenmeyen ret hatasının süreci etkilemesi engellenir.

İncelemede bulunan seyrek dizi eşitliği, uzun metinlerde toplam iş sınırı,
harf dönüşümünün çıktıyı büyütmesi ve doğrulamada nesne `toString` çağrılması
regresyonları ayrı testlerle korunur. Son komut kanıtları `progress.md` içindedir.
