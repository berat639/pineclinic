/**
 * data/default-tools.ts — Varsayılan tool açıklamaları
 *
 * Tool function declarations'ın description alanları admin panelden
 * düzenlenebilir. DB'de `tools.*` prefix'li key olarak saklanır.
 * DB'de yoksa buradaki varsayılanlar kullanılır.
 */

export interface ToolDescriptionDef {
  key: string
  toolName: string
  label: string
  defaultDescription: string
}

export interface ToolParamDef {
  key: string
  toolName: string
  paramName: string
  label: string
  defaultDescription: string
}

// ── Tool-level descriptions ─────────────────────────────────────────────────

export const TOOL_DESCRIPTIONS: ToolDescriptionDef[] = [
  {
    key: 'tools.randevuOlustur',
    toolName: 'randevuOlustur',
    label: 'Randevu Oluştur',
    defaultDescription: 'Müşteri için randevu oluşturur ve sisteme kaydeder.',
  },
  {
    key: 'tools.randevuGuncelle',
    toolName: 'randevuGuncelle',
    label: 'Randevu Güncelle',
    defaultDescription: 'Daha önce oluşturulan randevuyu günceller. Eksik bilgi tamamlandığında, tarih/saat değiştiğinde veya ek bilgi eklendiğinde kullan. randevuOlustur sonrasında dönen randevu_id zorunludur.',
  },
  {
    key: 'tools.searchKnowledgeBase',
    toolName: 'searchKnowledgeBase',
    label: 'Bilgi Bankası Ara',
    defaultDescription: 'Bilgi tabanında arama yapar. Hizmetler, fiyatlar, kampanyalar, detaylar için kullan. Müşteri bir ürün veya hizmet sorarsa bu aracı kullan.',
  },
  {
    key: 'tools.musteriSorgula',
    toolName: 'musteriSorgula',
    label: 'Müşteri Sorgula',
    defaultDescription: 'Müşterinin telefon numarasıyla sistemden müşteri bilgisini (ad soyad, geçmiş randevular) getirir. Görüşme başında müşteri telefon numarasını söyledikten HEMEN SONRA çağır — böylece müşteriyi ismiyle selamlayabilir ve mevcut bilgileri kullanabilirsin.',
  },
  {
    key: 'tools.gecmisRandevular',
    toolName: 'gecmisRandevular',
    label: 'Geçmiş Randevular',
    defaultDescription: 'Müşterinin telefonuna göre önceki randevu kayıtlarını sistemden getirir. Müşteri "geçen sefer", "önceki randevum" gibi konulara atıfta bulunduğunda kullan.',
  },
  {
    key: 'tools.randevuMusaitlikKontrol',
    toolName: 'randevuMusaitlikKontrol',
    label: 'Müsaitlik Kontrol',
    defaultDescription: 'Belirli bir tarih veya tarih aralığındaki mevcut randevuları sistemden getirir. Randevu öncesi müsaitlik kontrolü için kullan.',
  },
  {
    key: 'tools.cagriySonlandir',
    toolName: 'cagriySonlandir',
    label: 'Çağrıyı Sonlandır',
    defaultDescription: 'Telefon görüşmesini sonlandırır. YALNIZCA müşteri açıkça veda edip aramayı bitirmek istediğini belirttiğinde kullan (örn: "iyi günler", "görüşürüz", "hoşça kalın"). Kısa bir veda cümlesi söyledikten SONRA çağır.',
  },
]

// ── Parameter-level descriptions ────────────────────────────────────────────

export const TOOL_PARAM_DESCRIPTIONS: ToolParamDef[] = [
  // randevuOlustur params
  { key: 'tools.randevuOlustur.musteri_adi', toolName: 'randevuOlustur', paramName: 'musteri_adi', label: 'Müşteri Adı', defaultDescription: 'Müşterinin AÇIKÇA SÖYLEDİĞİ gerçek ad soyadı. Köşeli parantez, şablon veya uydurma isim YASAK. Önce bilgileri sesli tekrar edip müşteri onayı al.' },
  { key: 'tools.randevuOlustur.telefon', toolName: 'randevuOlustur', paramName: 'telefon', label: 'Telefon', defaultDescription: 'Müşterinin AÇIKÇA SÖYLEDİĞİ gerçek telefonu (rakamlar). Şablon veya köşeli parantez YASAK.' },
  { key: 'tools.randevuOlustur.randevu_turu', toolName: 'randevuOlustur', paramName: 'randevu_turu', label: 'Randevu Türü', defaultDescription: 'Randevu türü' },
  { key: 'tools.randevuOlustur.randevu_turu_enum', toolName: 'randevuOlustur', paramName: 'randevu_turu_enum', label: 'Randevu Türü Seçenekleri', defaultDescription: 'service,test_drive,gallery_visit,other' },
  { key: 'tools.randevuOlustur.arac_bilgisi', toolName: 'randevuOlustur', paramName: 'arac_bilgisi', label: 'Ek Bilgi (araç/detay)', defaultDescription: 'Ek bilgi (araç, marka, model vb.)' },
  { key: 'tools.randevuOlustur.plaka', toolName: 'randevuOlustur', paramName: 'plaka', label: 'Plaka/Kimlik', defaultDescription: 'Müşteriye ait tanımlayıcı bilgi (plaka, TC no, dosya no vb.)' },
  { key: 'tools.randevuOlustur.sorun_veya_talep', toolName: 'randevuOlustur', paramName: 'sorun_veya_talep', label: 'Sorun/Talep', defaultDescription: 'Müşterinin şikayeti veya talebi' },
  { key: 'tools.randevuOlustur.tarih', toolName: 'randevuOlustur', paramName: 'tarih', label: 'Tarih', defaultDescription: 'Randevu tarihi (YYYY-MM-DD)' },
  { key: 'tools.randevuOlustur.saat', toolName: 'randevuOlustur', paramName: 'saat', label: 'Saat', defaultDescription: 'Randevu saati (HH:MM)' },
]

// ── Lookup helpers ──────────────────────────────────────────────────────────

export const TOOL_DESC_MAP = new Map(TOOL_DESCRIPTIONS.map(t => [t.key, t]))
export const TOOL_PARAM_MAP = new Map(TOOL_PARAM_DESCRIPTIONS.map(p => [p.key, p]))

export const ALL_TOOL_KEYS = [
  ...TOOL_DESCRIPTIONS.map(t => t.key),
  ...TOOL_PARAM_DESCRIPTIONS.map(p => p.key),
]

export function getDefaultToolDescription(key: string): string | null {
  return TOOL_DESC_MAP.get(key)?.defaultDescription
    ?? TOOL_PARAM_MAP.get(key)?.defaultDescription
    ?? null
}
