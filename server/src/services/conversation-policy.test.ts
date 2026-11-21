import { describe, expect, test } from 'bun:test'
import { isConversationRepairOrAside } from './conversation-policy'

describe('Phone conversation repair protection', () => {
  test.each([
    'Cümlemi bitirmemi bekler misin?',
    'Niye bu kadar geç cevap veriyorsun?',
    'Sesimi duyuyor musun?',
    'Çakmağımı yakıyordum, bunu niye kesinti olarak algılıyorsun?',
    "Kenan'la konuşuyordum, senle değil.",
    'Başkasıyla konuşuyorum, biraz bekle.',
    'Ne iş yapıyorsun?',
    'Görüşmeyi kapatma.',
  ])('protects feedback/aside: %s', text => {
    expect(isConversationRepairOrAside(text)).toBe(true)
  })

  test.each([
    'Sesimi duymuyorsun, kapat.',
    'Cümlemi bitirmemi beklemiyorsun, görüşmeyi sonlandır.',
    'Tamam, görüşürüz.',
    'Randevu almak istiyorum.',
    'Bugün hava nasıl?',
    'Yarın saat üç uygun mu?',
  ])('does not block explicit hangup or classify normal requests as feedback: %s', text => {
    expect(isConversationRepairOrAside(text)).toBe(false)
  })
})
