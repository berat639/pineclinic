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

// Kullanıcı bilgi bankasını arayüzden kendisi dolduracaktır.
export const RAG_PROMPT_DOCS: RagPromptDoc[] = []
