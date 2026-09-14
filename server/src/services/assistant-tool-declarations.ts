import { Type, type FunctionDeclaration } from '@google/genai'
import { getToolDescriptions } from '../db/repositories/settings'
import { getDefaultToolDescription } from '../data/default-tools'

export async function buildToolDeclarations(direction: string = 'inbound'): Promise<FunctionDeclaration[]> {
  const { getActiveFlow, flowToToolFields } = await import('../db/repositories/flows')
  let dbDescs: Record<string, string> = {}
  try { dbDescs = await getToolDescriptions() } catch { /* use defaults */ }
  const desc = (key: string) => dbDescs[key] ?? getDefaultToolDescription(key) ?? ''

  // Build randevuOlustur fields from flow (zero hardcoded fields)
  const flow = await getActiveFlow(direction)
  let fieldProps: Record<string, unknown> = {}
  let fieldRequired: string[] = []

  if (flow && flow.nodes.some(n => n.type === 'FIELD')) {
    const { properties, required } = flowToToolFields(flow)
    for (const [k, v] of Object.entries(properties)) {
      fieldProps[k] = v.enum
        ? { type: Type.STRING, enum: v.enum, description: v.description }
        : { type: Type.STRING, description: v.description }
    }
    fieldRequired = required
  } else {
    // Fallback: legacy custom_fields from business_settings
    let allFields: Array<{ name: string; description: string; required?: boolean; active?: boolean }> = []
    try {
      const raw = dbDescs['tools.custom_fields']
      if (raw) allFields = JSON.parse(raw)
    } catch { /* ignore */ }

    if (allFields.length > 0) {
      for (const f of allFields) {
        if (f.active === false) continue
        const safeName = f.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
        fieldProps[safeName] = { type: Type.STRING, description: f.description }
        if (f.required) fieldRequired.push(safeName)
      }
    }
  }

  // Ensure doktor_id and musteri_adi are always available as optional params
  if (!fieldProps['doktor_id']) {
    fieldProps['doktor_id'] = { type: Type.STRING, description: 'Mevcut hasta için atanacak doktorun ID\'si (musteriSorgula sonucundaki doktor_gecmisi\'nden). Eğer hasta seçim yapmazsa veya farketmez derse boş (null) bırakın.' }
  }
  if (!fieldProps['musteri_adi']) {
    fieldProps['musteri_adi'] = { type: Type.STRING, description: 'Müşteri adı soyadı (kayıtlı müşteri için musteriSorgula\'dan gelen ad)' }
  }

  const tools: FunctionDeclaration[] = [
    {
      name: 'randevuOlustur',
      description: 'Müşteri randevu almak istediğinde randevu oluşturur ve kaydeder. Aynı arama içinde birden fazla kişi için sırayla birden fazla kez çağrılabilir.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          musteri_adi: { type: Type.STRING, description: 'Hasta adı ve soyadı' },
          telefon: { type: Type.STRING, description: 'Hasta telefon numarası' },
          tarih: { type: Type.STRING, description: 'Randevu tarihi (YYYY-MM-DD formatında)' },
          saat: { type: Type.STRING, description: 'Randevu saati (HH:MM formatında)' },
          sikayet: { type: Type.STRING, description: 'Hastanın şikayeti veya işlem talebi' },
          doktor_id: { type: Type.STRING, description: 'Tercih edilen hekim ID\'si (Hasta hekim belirtmezse veya farketmez derse boş bırakın)' },
          ...fieldProps,
        },
        required: ['musteri_adi', 'telefon', 'tarih', 'saat'],
      },
    },
    {
      name: 'randevuGuncelle',
      description: 'Mevcut bir randevunun tarih, saat veya diğer bilgilerini günceller.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          randevu_id: { type: Type.STRING, description: 'Güncellenecek randevu ID\'si' },
          musteri_adi: { type: Type.STRING, description: 'Müşteri adı soyadı' },
          telefon: { type: Type.STRING, description: 'Telefon numarası' },
          tarih: { type: Type.STRING, description: 'Yeni tarih (YYYY-MM-DD)' },
          saat: { type: Type.STRING, description: 'Yeni saat (HH:MM)' },
          sorun_veya_talep: { type: Type.STRING, description: 'Şikayet / talep' },
        },
        required: ['randevu_id'],
      },
    },
    {
      name: 'musteriSorgula',
      description: 'Arayan telefon numarasına göre hastayı sorgular; kayıtlı ise ad soyad ve geçmiş randevularını döndürür.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Sorgulanacak telefon numarası' },
        },
        required: ['telefon'],
      },
    },
    {
      name: 'gecmisRandevular',
      description: 'Müşterinin geçmiş randevu listesini döndürür.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Telefon numarası' },
          limit: { type: Type.INTEGER, description: 'Maksimum kayıt sayısı' },
        },
        required: ['telefon'],
      },
    },
    {
      name: 'randevuMusaitlikKontrol',
      description: 'Belirli bir tarihteki randevu yoğunluğunu ve müsaitliği kontrol eder.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: 'Kontrol edilecek tarih (YYYY-MM-DD)' },
          baslangic_tarih: { type: Type.STRING, description: 'Başlangıç tarihi (YYYY-MM-DD)' },
          bitis_tarih: { type: Type.STRING, description: 'Bitiş tarihi (YYYY-MM-DD)' },
        },
      },
    },
    {
      name: 'searchKnowledgeBase',
      description: 'Klinik hakkında, doktorlar, hizmetler veya çalışma saatleri hakkında bilgi tabanında arama yapar.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sorgu: { type: Type.STRING, description: 'Aranacak kelime veya soru' },
        },
        required: ['sorgu'],
      },
    },
    {
      name: 'hastaNotKaydet',
      description: 'Hasta randevu oluşturmayıp kliniğe bir not, mesaj veya şikayet iletmek istediğinde bankonun görmesi için not kaydeder.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Hastanın telefon numarası' },
          not: { type: Type.STRING, description: 'Hastanın kliniğe iletmek istediği not veya mesaj' },
          hasta_adi: { type: Type.STRING, description: 'Hastanın adı ve soyadı (biliniyorsa)' },
        },
        required: ['telefon', 'not'],
      },
    },
    {
      name: 'aramaAktar',
      description: 'Aramayı yetkili birime veya başka bir telefon numarasına aktarır. Berat Bey\'e aktarmak için hedef: "05076652367" veya "berat" olarak kullanılır.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          hedef: { type: Type.STRING, description: 'Aktarılacak hedef: Telefon numarası (örn: "05076652367"), "berat", "resepsiyon", "banko", "acil"' },
          sebep: { type: Type.STRING, description: 'Aktarım sebebi' },
        },
        required: ['hedef'],
      },
    },
    {
      name: 'havaDurumuSorgula',
      description: 'Belirtilen şehrin (varsayılan Ankara) anlık canlı hava durumunu ve sıcaklığını sorgular.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sehir: { type: Type.STRING, description: 'Hava durumu sorgulanacak şehir (varsayılan: "Ankara")' },
        },
      },
    },
    {
      name: 'cagriySonlandir',
      description: 'Müşteri ile görüşme tamamlandığında veya müşteri vedalaştığında çağrıyı sonlandırır.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
  ]
  return tools
}
