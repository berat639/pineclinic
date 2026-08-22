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
Yetkili bir klinik asistanı olarak, hastanın sorusuna yalnızca sağlanan bilgi bankası verilerini kullanarak profesyonel ve kısa yanıt ver. Eğer bilgi bankasında gerekli bilgi yoksa kesinlikle tahminde bulunma; hastadan gerekli bilgileri nazikçe iste. Fiyat/tutar sorulduğunda rakam verme, "fiyat bilgisini hekimlerimiz muayene sonrası iletecektir" deyip randevu oluşturmayı teklif et.`

export interface RagPromptDoc {
  category: KnowledgeCategory
  title: string
  content: string
}

export const RAG_PROMPT_DOCS: RagPromptDoc[] = [
  {
    category: 'sss',
    title: 'Diş taşı temizliği (detertraj) fiyatı ve süresi',
    content:
      'Bilgi bankasındaki detertraj (diş taşı temizliği) prosedürünü açıkla. İşlemin genellikle 20-30 dakika sürdüğünü belirt. Fiyat/rakam verme; güncel ücret bilgisini muayene sonrasında hekimimizin ileteceğini söyle ve muayene için randevu oluşturmayı teklif et.',
  },
  {
    category: 'sss',
    title: 'Dişim ağrıyor, acil randevu alabilir miyim',
    content:
      'Hastanın şikayetini kısaca dinle ve aciliyet durumunu (şişlik, şiddetli ağrı, kanama vb.) teyit et. Bilgi bankasındaki acil hasta kabul prosedürüne göre en yakın boş saate veya nöbetçi hekime yönlendirerek acil randevu oluştur.',
  },
  {
    category: 'sss',
    title: 'İmplant tedavisi ne kadar sürer ve fiyatı nedir',
    content:
      'Bilgi bankasındaki implant tedavi süreçlerini özetle. Cerrahi aşamanın kısa sürdüğünü ancak kemik kaynaması (osteointegrasyon) için 2-3 ay beklendiğini açıkla. Fiyat/rakam verme; implant marka ve sayısına göre değiştiği için muayene sonrası net fiyat verileceğini belirtip randevu teklif et.',
  },
  {
    category: 'sss',
    title: 'Diş teli (Ortodonti) tedavisi için yaş sınırı var mı',
    content:
      'Bilgi bankasındaki ortodonti prosedürlerini kontrol et. Diş teli tedavisinde herhangi bir üst yaş sınırı olmadığını, diş ve diş eti sağlığı yerinde olan her yetişkine uygulanabileceğini belirt. Şeffaf plak (Invisalign) seçeneğinden de kısaca bahsederek muayeneye davet et.',
  },
  {
    category: 'sss',
    title: 'Kanal tedavisi ağrılı bir işlem midir',
    content:
      'Bilgi bankasındaki endodonti (kanal tedavisi) bilgilendirme metnini kullan. Günümüz lokal anestezi yöntemleriyle kanal tedavisinin tamamen ağrısız ve konforlu bir şekilde yapıldığını güven verici bir dille anlat. Gerekirse randevu oluştur.',
  },
  {
    category: 'sss',
    title: 'Diş beyazlatma (bleaching) kalıcı mıdır, dişlere zarar verir mi',
    content:
      'Bilgi bankasındaki beyazlatma prosedürlerini açıkla. Klinik ortamında uzman hekim tarafından yapılan beyazlatmanın diş minesine zarar vermediğini belirt. Kalıcılığın çay, kahve ve sigara tüketimine bağlı olarak 1-3 yıl arası değiştiğini vurgula.',
  }
]
