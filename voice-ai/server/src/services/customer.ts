import type { CustomerContext } from '../db'

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  service: 'Servis',
  test_drive: 'Test Sürüşü',
  gallery_visit: 'Galeri Ziyareti',
  other: 'Diğer',
}

/**
 * Build a personalized system prompt based on customer context.
 * If no customer context, returns the base prompt.
 */
export function buildSystemPrompt(customer?: CustomerContext | null): string {
  const base = `Türkçe konuşan otomotiv asistanısın. Servis, araç alım-satım ve test sürüşü konularında yardım et. Doğal, kısa ve samimi konuş; soru sorduktan sonra cevap bekle.

KARŞILAMA: "Merhaba! Servis randevusu, araç alım-satım veya test sürüşü için yardımcı olabilirim. Ne için aradınız?"

SERVİS: Ad+telefon+araç+şikayeti al → 2 iş günü sonrasına randevu öner → randevuOlustur ile kaydet.
Fiyatlar: Yağ değişimi 800₺ | Fren bakımı 1200₺ | Genel bakım 1500₺

GALERİ/SATIŞ: Tercih+bütçeyi öğren → araç öner → test sürüşü/galeri ziyareti randevusu oluştur.

KURALLAR: Sadece Türkçe. Randevuda tarih+saat net söyle. Randevu oluşturduktan sonra tekrar randevu oluşturma — sadece güncelle.`

  if (!customer || customer.appointmentHistory.length === 0) return base

  const pastAppointments = customer.appointmentHistory.filter(a => a.isPast)
  const upcomingAppointments = customer.appointmentHistory.filter(a => !a.isPast)

  let customerSection = `\n\n--- MEVCUT MÜŞTERİ BİLGİSİ ---
Müşteri: ${customer.name}
Telefon: ${customer.phone}`

  if (upcomingAppointments.length > 0) {
    customerSection += `\nGelecek Randevular:`
    for (const appt of upcomingAppointments) {
      const label = APPOINTMENT_TYPE_LABELS[appt.type] ?? appt.type
      customerSection += `\n  - ${label}: ${appt.date} ${appt.time}`
      if (appt.vehicleInfo) customerSection += ` (${appt.vehicleInfo})`
    }
  }

  if (pastAppointments.length > 0) {
    customerSection += `\nGeçmiş Randevular:`
    for (const appt of pastAppointments.slice(0, 3)) {
      const label = APPOINTMENT_TYPE_LABELS[appt.type] ?? appt.type
      customerSection += `\n  - ${label}: ${appt.date}`
      if (appt.issueOrRequest) customerSection += ` — "${appt.issueOrRequest}"`
    }
  }

  customerSection += `\n\nMüşteriyi ismiyle (${customer.name.split(' ')[0]}) karşıla. Geçmiş randevularından haberdar olduğunu belirt.`
  customerSection += `\n--- MÜŞTERİ BİLGİSİ SONU ---`

  return base + customerSection
}
