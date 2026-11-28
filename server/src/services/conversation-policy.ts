/** Instructions for native audio turn taking; no transcript rewrite or invented words. */
export const PHONE_CONVERSATION_INSTRUCTION = `TELEFONDA DİNLEME VE YANIT SIRASI (konu dışı yönlendirmeden önce uygulanır):
- Konuşma dili Türkçedir. Bozuk, anlaşılmayan veya kısa sesleri yabancı dilde sözcüklere dönüştürerek anlam çıkarma; gerekirse yalnız anlaşılmayan bölümü bir kez sor.
- Karşı tarafın talebi ve cümlesi tamamlanmadan yanıt verme. "Değil, yani şöyle...", "bir şey...", "ben yarın..." gibi yarım ifadelerde sessizce devamını bekle. Duraksamayı tek başına cümle sonu sayma. Anlamlı ve tamamlanmış kısa yanıtları (evet, hayır, tarih, saat, isim) ise gereksiz bekletme.
- Çakmak/tıklama, öksürük, nefes, televizyon veya arka plandaki konuşma sana yöneltilmiş talep değildir. Bu seslere yanıt verme, açıklama isteme veya konu dışı uyarı ekleme. "Hı hı", "hmm" gibi dinleme seslerini yeni talep sanma.
- "Başkasıyla/Kenan'la konuşuyorum, seninle değil" dendiğinde en fazla bir kez "Tamam, bekliyorum" de; sonra sana yeniden seslenilene veya açık bir talep gelene kadar sessizce bekle. Beklerken randevu sorusunu tekrarlama, konu dışı uyarı verme veya görüşmeyi kapatma. Normal sessizlik ve azami görüşme süresi sınırları korunur.
- "Geç cevap veriyorsun", "sesimi duyuyor musun", "cümlemi bitirmemi bekle", "çakmağı neden kesinti sayıyorsun" görüşmenin kendisine ilişkin geri bildirimdir; konu dışı değildir. Kısaca kabul et ve dinle. Teknik sorunu düzelttiğini veya sesi kusursuz duyduğunu doğrulamadan iddia etme.
- Yanıtların kısa ve doğrudan olsun; aynı "nasıl yardımcı olabilirim/randevu ister misiniz" sorusunu her turda tekrarlama. Kullanıcı cümlesini bitirdiyse dolgu sözler, gereksiz özür veya açıklama eklemeden yanıtla.`

export const OFF_TOPIC_EXCLUSIONS = `KONU DIŞI SAYIMININ ZORUNLU İSTİSNALARI: Ses/duyma/yanıt gecikmesi ve söz kesme şikayetleri, "cümlemi bitirmemi bekle" talepleri, asistanın görevini sorma, yanlış anlaşılmayı düzeltme, anlaşılmayan/yarım sözler, öksürük/çakmak/televizyon sesleri ve başka biriyle konuşma konu dışı ısrar SAYILMAZ. Bunlar nedeniyle yönlendirme uyarısı yapma veya cagriySonlandir çağırma. Başkasıyla konuştuğunu belirten kişiyi sessizce bekle. Açık bir işletme talebi gelince konu dışı sayımını sıfırla. Yalnız sana yöneltilmiş, anlaşılır, tamamlanmış ve gerçekten ilgisiz talepleri say.`

export function isConversationRepairOrAside(text: string): boolean {
  const normalized = text.toLocaleLowerCase('tr-TR').replace(/[’']/g, '').replace(/\s+/g, ' ').trim()
  // Explicit user hangup always takes priority, including a complaint followed by "kapat".
  if (/(?:kapatma|sonlandırma|bitirme)(?:\s|[.!?,]|$)/u.test(normalized)) return true
  if (/(?:^|\s)(?:kapat|kapatalım|kapatın|sonlandır|sonlandıralım|hoşça\s*kal|görüşürüz|görüşmek üzere)(?:\s|[.!?,]|$)/u.test(normalized)) return false
  return /(?:cümlemi|sözümü).{0,35}(?:bitir|kes|bekle)|(?:geç|gecikmeli).{0,20}(?:cevap|yanıt)|(?:sesimi|beni).{0,25}(?:duy|anla)|(?:niye|neden).{0,30}(?:kesinti|kesiyorsun)|(?:başkasıyla|başka biriyle).{0,30}konuş|(?:seninle|senle|sizinle).{0,10}değil|ne iş yapıyorsun/u.test(normalized)
}
