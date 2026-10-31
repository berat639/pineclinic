const NETGSM_ERROR_REASONS: Record<string, string> = {
  '20': 'Mesaj metni veya karakter sınırı hatası (NetGSM Kod 20). 💡 Öneri: Mesajda desteklenmeyen özel karakter olmadığından ve 917 karakter sınırını aşmadığından emin olun.',
  '30': 'NetGSM API kullanıcı adı/şifre hatalı veya API erişim/IP izni kapalı (NetGSM Kod 30). 💡 Öneri: 1) API kullanıcı kodu ve parolasını kontrol edin. 2) NetGSM Paneli → Abonelik İşlemleri → API İşlemleri menüsünden API erişimini açın ve varsa IP kısıtlamasına sunucu IP adresini ekleyin.',
  '40': 'Gönderici başlığı (MsgHeader) NetGSM hesabında tanımlı veya onaylı değil (NetGSM Kod 40). 💡 Öneri: Başlık alanına girdiğiniz değerin (örn. ONLNEMLAKTN) NetGSM panelindeki onaylı başlığınızla büyük/küçük harf dahil birebir aynı olduğundan emin olun.',
  '50': 'Abone hesabınız ile İYS kontrollü gönderim yapılamıyor (NetGSM Kod 50). 💡 Öneri: NetGSM panelinden İYS ayarlarınızı veya bilgilendirme başlığı yetkinizi kontrol edin.',
  '51': 'Aboneliğinize tanımlı İYS Marka bilgisi bulunamadı (NetGSM Kod 51). 💡 Öneri: NetGSM panelinde başlığınıza tanımlı İYS marka kaydını kontrol edin.',
  '70': 'Eksik veya hatalı sorgulama parametresi (NetGSM Kod 70). 💡 Öneri: Alıcı telefon numarasının 5XX XXX XX XX formatında geçerli bir GSM numarası olduğundan ve kullanıcı/başlık alanlarının dolu olduğundan emin olun.',
  '80': 'Dakikalık gönderim sınır aşımı (NetGSM Kod 80). 💡 Öneri: 1 dakika bekleyip tekrar deneyin.',
  '85': 'Aynı numaraya mükerrer gönderim sınırı aşımı (NetGSM Kod 85). 💡 Öneri: Aynı numaraya kısa sürede çok fazla SMS gönderildi; birkaç dakika bekleyin veya farklı bir test numarası girin.',
}

export async function sendSMS({
  usercode,
  password,
  senderId,
  phone,
  message,
}: {
  usercode: string
  password: string
  senderId: string
  phone: string
  message: string
}) {
  // Telefon numarasından gereksiz karakterleri temizle (sadece rakam kalsın)
  const cleanPhone = phone.replace(/\D/g, '')
  
  // NetGSM HTTP GET API Endpoint (dil=TR Türkçe karakter desteği için)
  const url = `https://api.netgsm.com.tr/sms/send/get/?usercode=${encodeURIComponent(
    usercode
  )}&password=${encodeURIComponent(password)}&gsmno=${encodeURIComponent(
    cleanPhone
  )}&message=${encodeURIComponent(message)}&msgheader=${encodeURIComponent(senderId)}&dil=TR`

  try {
    const response = await fetch(url)
    const data = (await response.text()).trim()
    
    // NetGSM başarılı gönderimde "00 1234567" gibi bir mesaj ID'si veya "00" döndürür
    const success = data.startsWith('00')
    const code = data.split(/\s+/)[0] || ''
    const reason = success ? undefined : (NETGSM_ERROR_REASONS[code] || `NetGSM yanıt kodu: ${code || 'bilinmiyor'}`)
    
    return { success, response: data, reason }
  } catch {
    // Errors can contain the complete provider URL, including credentials and
    // message content. Never copy them into logs or API responses.
    console.error('NetGSM isteği tamamlanamadı.')
    return { success: false, error: 'Gönderim sonucu doğrulanamadı', reason: 'NetGSM sunucusuna ulaşılamadı' }
  }
}
