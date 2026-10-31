const NETGSM_ERROR_REASONS: Record<string, string> = {
  '20': 'Mesaj metni veya karakter sınırı hatası (Kod 20)',
  '30': 'NetGSM API kullanıcı adı/şifre hatalı veya API erişim/IP izni kapalı (Kod 30)',
  '40': 'Gönderici başlığı (MsgHeader) NetGSM hesabında tanımlı değil (Kod 40)',
  '50': 'Abone hesabınız ile İYS kontrollü gönderim yapılamıyor (Kod 50)',
  '51': 'Aboneliğinize tanımlı İYS Marka bilgisi bulunamadı (Kod 51)',
  '70': 'Eksik veya hatalı sorgulama parametresi (Kod 70)',
  '80': 'Gönderim sınır aşımı (Kod 80)',
  '85': 'Mükerrer gönderim sınırı aşımı (Kod 85)',
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
