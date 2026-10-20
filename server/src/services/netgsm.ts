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
  
  // NetGSM HTTP GET API Endpoint
  const url = `https://api.netgsm.com.tr/sms/send/get/?usercode=${encodeURIComponent(
    usercode
  )}&password=${encodeURIComponent(password)}&gsmno=${encodeURIComponent(
    cleanPhone
  )}&message=${encodeURIComponent(message)}&msgheader=${encodeURIComponent(senderId)}`

  try {
    const response = await fetch(url)
    const data = await response.text()
    
    // NetGSM başarılı gönderimde "00 1234567" gibi bir mesaj ID'si veya "00" döndürür
    const success = data.startsWith('00')
    
    return { success, response: data }
  } catch (err: any) {
    console.error('NetGSM Error:', err)
    return { success: false, error: err.message || 'Bilinmeyen hata' }
  }
}
