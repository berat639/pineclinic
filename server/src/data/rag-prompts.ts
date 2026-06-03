/**
 * data/rag-prompts.ts — Bilgi bankası senaryo prompt'ları
 *
 * RAG_BASE_TEMPLATE: SYSTEM_PROMPT'a eklenen, bilgi bankasının nasıl
 *   kullanılacağını anlatan temel davranış kuralı.
 * RAG_PROMPT_DOCS: Deploy'da knowledge_documents tablosuna seed edilen
 *   senaryo prompt'ları. `title` = müşteri sorusu, `content` = asistanın o
 *   senaryoda izleyeceği prosedür. RAG ile (searchKnowledgeBase tool'u veya
 *   pre-warm) çekilir; içerikteki yönergeler doğal konuşma diline çevrilir.
 *
 * NOT (fiyat politikası): Sistem geneli "fiyat verme" kuralı korunur. Fiyat
 * istenen senaryolarda tutar verilmez; "ücreti/fiyatı servis ekibimiz iletecek"
 * denip randevuya yönlendirilir.
 */

import type { KnowledgeCategory } from '../db/repositories/knowledge'

export const RAG_BASE_TEMPLATE = `BİLGİ BANKASI KULLANIMI:
Yetkili bir servis asistanı olarak, müşterinin sorusuna yalnızca sağlanan bilgi bankası verilerini kullanarak profesyonel ve kısa yanıt ver. Eğer bilgi bankasında gerekli bilgi yoksa kesinlikle tahminde bulunma; müşteriden plaka veya şasi numarası gibi eksik olan bilgiyi nazikçe iste. Fiyat/tutar sorulduğunda rakam verme, "fiyat bilgisini servis ekibimiz iletecek" deyip randevu oluşturmayı teklif et.`

export interface RagPromptDoc {
  category: KnowledgeCategory
  title: string
  content: string
}

export const RAG_PROMPT_DOCS: RagPromptDoc[] = [
  {
    category: 'sss',
    title: 'Aracım bakım için fiyat ve içerik bilgisi almak istiyorum',
    content:
      'Bilgi bankasındaki aracın kilometre ve model bilgisine göre yapılacak periyodik bakım paketini ve değişecek parçaları açıkla. Tutar/rakam verme; KDV dahil bakım ücretini servis ekibimizin ileteceğini belirt ve randevu oluşturmayı teklif et. Bilgi eksikse plaka veya şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Aracım egzoz sistemini kontrol edin uyarısı veriyor',
    content:
      "Bilgi bankasındaki 'Egzoz/Emisyon Uyarı Prosedürü'nü incele. Bu uyarının kritiklik seviyesini belirt, aracın kullanılmaya devam edip edemeyeceğini söyle ve en yakın servis için randevu yönlendirmesi yap. Bilgi yoksa tahmin etme, eksik bilgiyi iste.",
  },
  {
    category: 'sss',
    title: 'Aracımda motor arıza ışığı yanıyor',
    content:
      'Bilgi bankasındaki teknik kılavuz verisini kullanarak motor arıza ışığının sabit yanması ile yanıp sönmesi arasındaki farkı açıkla. Aciliyet durumunu belirterek çekici hizmetine veya servise yönlendir.',
  },
  {
    category: 'sss',
    title: 'Aracım üre sistemi arızası veriyor',
    content:
      'Bilgi bankasındaki AdBlue/Üre sistemi yönergelerini kontrol et. Sistemin motoru kilitlemeden önceki kalan menzil bilgisinin önemini vurgula ve dolum veya arıza tespiti için servise davet et.',
  },
  {
    category: 'sss',
    title: 'Aracımın bakım zamanını öğrenmek istiyorum',
    content:
      'Bilgi bankasındaki müşteri servis geçmişi verisinden son bakım tarihini ve kilometresini al. Bir sonraki periyodik bakımın hangi tarihte veya hangi kilometrede yapılması gerektiğini net olarak söyle. Bilgi yoksa plaka veya şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Aracımın garanti süresi ne zaman doluyor',
    content:
      'Bilgi bankasındaki araç ruhsat ve garanti paketi bilgilerine bak. Aracın trafiğe çıkış tarihini baz alarak garantinin bitiş tarihini ve kilometre sınırını net bir şekilde belirt. Bilgi yoksa plaka veya şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Yedek parça almak istiyorum fiyat öğrenebilir miyim',
    content:
      'Bilgi bankasındaki parça stok veritabanında talep edilen parçayı ara ve stok durumunu belirt. Fiyat/rakam verme; güncel parça fiyatını servis ekibimizin ileteceğini söyle. Kesin parça tespiti için müşteriden şasi numarası talep et.',
  },
  {
    category: 'sss',
    title: 'Aracımın bakım geçmişini ve yapılan işlemleri öğrenmek istiyorum',
    content:
      'Bilgi bankasındaki servis geçmişi verilerinden aracın servise giriş tarihlerini, kilometrelerini ve yapılan ana işlemleri kronolojik ve kısa maddeler halinde özetle. Bilgi yoksa plaka veya şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Aracım lastik basınç uyarısı veriyor, lastik basıncı kaç olmalı',
    content:
      'Bilgi bankasındaki araç modeline ait lastik ebatlarına göre olması gereken ön ve arka lastik basınç (PSI/Bar) değerlerini ver. Basınç ayarlandıktan sonra sistemin nasıl sıfırlanacağını kısaca anlat. Bilgi yoksa plaka veya şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Aracımın lastiklerini değiştirmek istiyorum, değişim ve otel ücreti',
    content:
      'Bilgi bankasındaki sökme-takma, rot-balans ve lastik oteli (sezonluk saklama) hizmetlerini açıkla. Fiyat/rakam verme; toplam ücreti servis ekibimizin ileteceğini belirt ve randevu isteyip istemediğini sor.',
  },
  {
    category: 'sss',
    title: 'Aracımla kaza yaptım, işleyiş hakkında bilgi almak istiyorum',
    content:
      'Bilgi bankasındaki kaza/hasar işleyiş prosedürüne göre tutanak tutulması, aracın servise çekilmesi, evrak teslimi ve kasko/trafik dosyası açılış adımlarını sırasıyla ve sakince özetle. Çekici gerekiyorsa acil destek numarasını ver.',
  },
  {
    category: 'sss',
    title: 'Aracım akü uyarısı veriyor, garanti süresi ve ölçüm bilgisi',
    content:
      'Bilgi bankasındaki akü garanti şartlarını kontrol et (örneğin süre ve kapsam dışı durumlar). Serviste yapılacak akü sağlık ölçümünün nasıl yapıldığını anlat; ölçüm ücreti bilgisini servis ekibimizin ileteceğini söyle ve randevu oluşturmayı teklif et.',
  },
  {
    category: 'sss',
    title: 'Aracımın batarya sağlığını nasıl öğrenebilirim',
    content:
      'Bilgi bankasındaki elektrikli/hibrit araç prosedürlerine göre batarya sağlığı (SOH) testinin yetkili servis cihazlarıyla (GDS vb.) nasıl yapıldığını ve işlemin süresini belirt. Ücret bilgisini servis ekibimizin ileteceğini söyle ve randevu öner.',
  },
  {
    category: 'sss',
    title: 'Aracım SOS arızası veriyor',
    content:
      'Bilgi bankasındaki e-Call/SOS telematik uyarı kılavuzuna göre sorunun bir kapsama alanı kaybı veya donanım/yazılım hatası olabileceğini belirt. Kontrol ve gerekirse yazılım güncellemesi için randevu yönlendirmesi yap.',
  },
  {
    category: 'sss',
    title: 'Aracımda mola verin uyarısı alıyorum, sebebi ve iptal edebilir miyim',
    content:
      'Bilgi bankasındaki sürücü yorgunluk tespiti (DAW) sistemi kılavuzuna göre bu uyarının sürüş süresine ve direksiyon hareketlerine bağlı olarak çalıştığını açıkla. Sistem menüsünden kapatılma adımlarını tarif et.',
  },
  {
    category: 'sss',
    title: 'Aracımda cam düğme panelinde arıza var, garanti kapsamında mı',
    content:
      'Bilgi bankasındaki garanti prosedürlerini kullanarak mekanik ve elektronik arızaların dış etken (sıvı teması, kırılma) yoksa standart garanti süresince kapsama alındığını belirt. Kesin karar için fiziki teşhis gerektiğini vurgula.',
  },
  {
    category: 'sss',
    title: 'Aracım vites sistemini kontrol edin uyarısı veriyor, sebebi nedir',
    content:
      'Bilgi bankasındaki şanzıman hata kodları rehberini incele. Uyarının yazılımsal veya mekanik bir problemi işaret edebileceğini, aracı zorlamadan durdurması ve gerekirse servise çekici ile gelmesi gerektiğini bildir.',
  },
  {
    category: 'sss',
    title: 'Aracımın şanzıman yağı ne zaman değişir',
    content:
      'Bilgi bankasındaki bakım periyodu tablosundan aracın vites türüne (DCT, Otomatik, Manuel) uygun şanzıman yağı değişim kilometresini ve yıl sınırını bularak net bir cevap ver. Bilgi yoksa şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Aracımda titreme var, kavrama değişimi ne zaman yapılır',
    content:
      'Bilgi bankasındaki baskı-balata/DCT kavrama prosedürlerinden kavramanın sarf malzeme olduğunu ve kullanım ömrünün sürücüye bağlı değiştiğini açıkla. Titremenin yazılımsal adaptasyon mu yoksa mekanik değişim mi gerektirdiğinin tespiti için randevu ver.',
  },
  {
    category: 'sss',
    title: 'Aracımın paketindeki kapalı özelliği açma',
    content:
      'Bilgi bankasındaki gizli özellik/yazılım politikasına göre yetkili servislerde standart donanım dışı özellik açma işlemlerinin yapılıp yapılmadığını ve bu tür 3. parti işlemlerin garantiye olan etkisini açıkça belirt.',
  },
  {
    category: 'sss',
    title: 'Aracı yeni aldım, mobil uygulamadan geçmişini görmek için onay bekliyor',
    content:
      'Bilgi bankasındaki uygulama destek prosedürlerine göre (MySkoda vb. marka uygulaması) ruhsat sahipliği doğrulama sürecini açıkla. Müşterinin ruhsat fotoğrafını nereye iletmesi gerektiğini veya onayın sistemden nasıl tetikleneceğini adım adım anlat.',
  },
  {
    category: 'sss',
    title: 'Aracımın antifriz rengi nedir',
    content:
      'Bilgi bankasındaki sıvı spesifikasyon tablosundan ilgili motor tipine uygun antifrizin türünü (Organik/Silikatlı) ve rengini ver. Farklı renklerin karıştırılmaması gerektiği uyarısını ekle. Bilgi yoksa şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Gösterge paneli değişiminde kilometre sıfırlanır mı',
    content:
      'Bilgi bankasındaki kilometre kayıt ve garanti prosedürlerini kullanarak panel değiştiğinde orijinal kilometrenin yeni panele kodlandığını veya yasal kayıt altına alınarak sıfırlanmadığını net bir dille açıkla.',
  },
  {
    category: 'sss',
    title: 'Aracımın navigasyon multimedya güncellemesini yaptırmak istiyorum',
    content:
      'Bilgi bankasındaki multimedya güncelleme politikasına göre işlemin serviste ne kadar süreceğini belirt. Ücret bilgisini servis ekibimizin ileteceğini söyle. Kullanıcının bunu resmi siteden USB ile kendisinin yapıp yapamayacağı bilgisini de ekle.',
  },
  {
    category: 'sss',
    title: 'Aracımın yakıt tüketimi çok fazla',
    content:
      'Bilgi bankasındaki teknik destek metinlerinden yakıt tüketimini etkileyen lastik basıncı, hava filtresi, sürüş tarzı ve yol koşulları gibi faktörleri listele. Bilgisayarlı kontrol için servis randevusu teklif et.',
  },
  {
    category: 'sss',
    title: 'Aracımın direksiyonunda titreme var, sebebi nedir',
    content:
      'Bilgi bankasındaki ön düzen arıza tespit rehberini baz alarak belirli hızlarda titremenin balans bozukluğu veya fren disk eğriliğinden kaynaklanabileceğini açıkla. Çözüm için rot-balans veya fren kontrolüne davet et.',
  },
  {
    category: 'sss',
    title: 'Aracımın camında hasar var, ücretli değişim ve kasko bilgisi',
    content:
      "Bilgi bankasındaki kasko anlaşmaları ve cam değişim bilgilerini incele. Kasko poliçelerindeki 'yılda 1 kez ücretsiz orijinal cam' hakkını hatırlat. Nakit işlem isteniyorsa rakam verme; parça ve işçilik dahil ücreti servis ekibimizin ileteceğini söyle.",
  },
  {
    category: 'sss',
    title: 'Aracımın rot-balans ayarlarını yaptırmak istiyorum',
    content:
      'Bilgi bankasındaki 4 teker rot-balans ayarı hizmetini açıkla ve işlemin tahmini süresini belirt. Ücret bilgisini servis ekibimizin ileteceğini söyle ve randevu onayı iste.',
  },
  {
    category: 'sss',
    title: 'Elektrikli aracımın menzilinde düşme sebebi nedir',
    content:
      'Bilgi bankasındaki elektrikli araç (EV) kullanım kılavuzundan menzili etkileyen soğuk hava, kalorifer/klima kullanımı ve agresif ivmelenme gibi faktörleri özetle. Şüphe devam ediyorsa batarya kontrolüne davet et.',
  },
  {
    category: 'sss',
    title: 'Aracımla ilgili geri çağırma ve güncelleme bilgisi geldi, detaylarını öğrenebilir miyim',
    content:
      'Bilgi bankasındaki kampanya/geri çağırma veritabanından müşterinin şasi numarasına tanımlı kampanya kodunu bul. Hangi parçanın/yazılımın güncelleneceğini ve tamamen ücretsiz olduğunu belirterek işlem süresini aktar. Şasi yoksa iste.',
  },
  {
    category: 'sss',
    title: 'Aracıma çeki demiri taktırmak istiyorum, montajı var mı',
    content:
      'Bilgi bankasındaki aksesuar listesinden aracın çeki demiri montajına uygun olup olmadığını kontrol et. Fiyat/rakam verme; orijinal parça ve işçilik ücretini servis ekibimizin ileteceğini söyle. Ayrıca ruhsata işleme (TSE/TÜVTÜRK) sürecinin müşteriye ait olduğunu hatırlat.',
  },
  {
    category: 'sss',
    title: 'Aracıma PPF kaplama cam filmi yaptırmak istiyorum',
    content:
      'Bilgi bankasındaki estetik/detaylandırma hizmetlerinden cam filmi ve PPF şeffaf kaplama paketlerini, kullanılan malzemenin mikron/garanti süresini açıkla. Fiyat/rakam verme; paket ücretini servis ekibimizin ileteceğini söyle.',
  },
  {
    category: 'sss',
    title: 'Aracıma geri görüş kamerası araç içi kamera taktırmak istiyorum',
    content:
      'Bilgi bankasındaki aksesuar montaj kurallarını kontrol et ve sunulan orijinal/onaylı kameraları açıkla. Fiyat/rakam verme; ücreti servis ekibimizin ileteceğini söyle. Dışarıdan müdahalenin elektrik sistemi garantisini bozabileceği uyarısını nazikçe ekle.',
  },
  {
    category: 'sss',
    title: 'Aracımda triger zincir mi kayış mı',
    content:
      'Müşterinin şasi numarasına veya belirttiği motor tipine göre bilgi bankasındaki motor özellikleri tablosundan triger tipinin zincir mi yoksa kayış mı olduğunu kesin olarak bul ve değişim aralığını (yıl/km) söyle. Bilgi yoksa şasi numarası iste.',
  },
  {
    category: 'sss',
    title: 'Aracımda korna arızası var, garanti kapsamında mı yapılacak',
    content:
      'Bilgi bankasındaki garanti prosedürlerini baz alarak kornanın su alma, darbe veya sonradan eklenen tesisat kaynaklı bir arızası yoksa standart garanti kapsamında ücretsiz değişeceğini belirt. Fiziki kontrol için randevu yönlendir.',
  },
  {
    category: 'sss',
    title: 'Aracım serviste, durumunu öğrenmek istiyorum',
    content:
      'Müşterinin plaka veya şasi bilgisini kullanarak bilgi bankasındaki aktif iş emirlerini (Work Order) tara. Aracın şu anki aşamasını (örneğin parça bekleniyor, asansörde, yıkamada, teslime hazır) ve tahmini teslim zamanını söyle. Bilgi yoksa danışmanına yönlendireceğini belirt.',
  },
]
