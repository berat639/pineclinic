export interface ReminderPreset {
  days: number
  label: string
  sublabel: string
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  { days: 7, label: '7 Gün', sublabel: 'Cerrahi / Dikiş' },
  { days: 14, label: '14 Gün', sublabel: 'Kısa Kontrol' },
  { days: 30, label: '1 Ay (30g)', sublabel: 'Ortodonti / Splint' },
  { days: 90, label: '3 Ay (90g)', sublabel: 'İmplant / Perio' },
  { days: 180, label: '6 Ay (180g)', sublabel: 'Rutin Kontrol' },
  { days: 365, label: '1 Yıl (365g)', sublabel: 'Yıllık / Protez' },
]

export function formatSingleReminderInterval(days: number): string {
  if (days === 180) return '6 Ay (180g)'
  if (days === 90) return '3 Ay (90g)'
  if (days === 30) return '1 Ay (30g)'
  if (days === 365) return '1 Yıl (365g)'
  if (days === 14) return '14 Gün'
  if (days === 7) return '7 Gün'
  return `${days} gün`
}

export function formatReminderLabel(periodic: boolean, periodDays: number | number[]): string {
  if (!periodic) return 'Tedavi hatırlatma bildirimleri · Kapalı'
  const list = (Array.isArray(periodDays) ? periodDays : [periodDays])
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n >= 1)
  const uniqueSorted = Array.from(new Set(list)).sort((a, b) => a - b)
  if (uniqueSorted.length === 0) return 'Tedavi hatırlatma bildirimleri · Kapalı'
  return `Tedavi hatırlatma bildirimleri · ${uniqueSorted.map(formatSingleReminderInterval).join(' + ')}`
}

// Complete TDB (Türk Dişhekimleri Birliği) clinical recall rules
const POST_OP_7_DAY_KEYWORDS = [
  'gömülü diş operasyonu',
  'komplikasyonlu diş çekimi',
  'kök ucu rezeksiyonu',
  'alveolit cerrahi',
  'kanama müdahalesi',
  'alveol plastiği',
  'alveol düzeltilmesi',
  'kist operasyonu',
  'epulis operasyonu',
  'osteomyelitis',
  'vestibüloplasti',
  'sinüs plastiği',
  'sert doku greftleme',
  'yumuşak doku greftleme',
  'sinüs lifting',
  'biyopsi',
  'fibrom operasyonu',
  'apse drenajı',
  'kapişon izalesi',
  'çene kırığı',
  'reimplantasyon',
  'ototransplantasyon',
  'torus operasyonu',
  'odontogenik tümör',
  'tükürük bezi kanalından taş',
  'açık eklem cerrahisi',
  'genioplasti',
  'segmental osteotomi',
  'osteotomi',
  'implant çıkartılması',
  'ankraj amaçlı plak',
  'koronektomi',
  'flap operasyonu',
  'tunnel operasyonu',
  'hemiseksiyon',
  'serbest diş eti grefti',
  'saplı yumuşak doku grefti',
  'subepitelyal bağ dokusu grefti',
  'frenektomi',
  'frenetomi',
  'papil oluşturma (cerrahi)',
  'avülsiyon tedavisi',
  'travma splinti',
]

const MONTHLY_30_DAY_KEYWORDS = [
  'angle sınıf',
  'ortodontik tedavi',
  'şeffaf plaklar ile ortodontik',
  'sabit kapanış yükseltici',
  'açık kapanışın ortodontik',
  'aparey yapımı',
  'vida uygulaması',
  'sabit fonksiyonel aygıt',
  'headgear',
  'düz ark teli',
  'büküm içeren tel',
  'segmental ark',
  'bant tatbiki',
  'braket tatbiki',
  'lingual braket',
  'lingual ark',
  'nance apareyi',
  'hızlı maksiller genişletme',
  'dudak damak yarığı',
  'distalizasyon apareyi',
  'gömülü dişin diş dizisinde yerine',
  'reserve curve',
  'mini vida uygulaması',
  'sürme rehberliği',
  'gece plağı',
  't.m.e. stabilizasyon splinti',
  't.m.e. splint',
  't.m.e. mekonoterapi',
  'açık apeksli dişte',
  'kanal pansumanı',
  'geçici (immediat) protez',
  'geçici obturatör',
]

const QUARTERLY_90_DAY_KEYWORDS = [
  'kemik içi implant',
  'zigoma implant',
  'periapikal lezyonlu dişte kanal tedavisi',
  'kanal dolgusu tekrarı',
  'retreatment',
  'kanalda perforasyon tamiri',
  'subgingival küretaj',
  'peri-implantitis',
  'biyomateryal uygulaması',
  'membran uygulaması',
  'botulinum toksin',
  'artrosentez',
  't.m.e. içi enjeksiyon',
]

const YEARLY_365_DAY_KEYWORDS = [
  'tam protez',
  'bölümlü protez',
  'hassas tutuculu protez',
  'implant destekli hareketli protez',
  'diş üstü protezi',
  'overdenture',
  'çocuk protezi',
  'yüz protezleri',
  'göz protezi',
  'kontrol hekim muayenesi',
]

const SIX_MONTH_180_DAY_KEYWORDS = [
  'detartraj',
  'diş taşı temizliği',
  'kompozit dolgu',
  'amalgam dolgu',
  'cam ionomer dolgu',
  'kompomer dolgu',
  'inley dolgu',
  'onley',
  'pinley',
  'laminate',
  'kuafaj',
  'kanal tedavisi',
  'endokron',
  'fiber post',
  'hazır post',
  'diş ağartma',
  'beyazlatma',
  'fissür örtülmesi',
  'sealant',
  'yüzeysel flor uygulaması',
  'rezin infilitrasyonu',
  'amputasyon',
  'süt dişi kanal tedavisi',
  'yer tutucu',
  'prefabrike kron',
  'strip kron',
  'zirkonyum kron',
  'veneer kuron',
  'tam seramik kuron',
  'jaket kuron',
  'teleskop kuron',
  'adeziv köprü',
  'pekiştirme tedavisi',
  'pekiştirme aygıtı',
  'lingual retainer',
  'periodontal splint',
  'dişhekimi muayenesi',
  'uzman dişhekimi muayenesi',
  'oral hijyen eğitimi',
]

const NO_REMINDER_DIAGNOSTIC_KEYWORDS = [
  'röntgen',
  'oklüzal film',
  'bite - wing',
  'panaromik film',
  'panoramik film',
  'sefalometrik film',
  'radyografi',
  'el bilek filmi',
  'siyalografi',
  'tomografi',
  'lokal anestezi',
  'raporlama',
  'ağız içi dijital tarama',
  'rubber-dam',
  'dolgu sökümü',
  'kuron sökümü',
  'kanal dolgusu sökümü',
  'bant veya braket çıkarılması',
  'ortodontik fotoğraf',
  'ortodontik model',
  'kemik yaşı tayini',
  'vitalite kontrolu',
]

export interface TdbReminderSuggestion {
  periodic: boolean
  days: number
  daysList?: number[]
  badge: string
  reason: string
}

export function getTdbReminderSuggestion(procedureNames: string[]): TdbReminderSuggestion | null {
  const normalized = procedureNames
    .map(name => name.trim().toLocaleLowerCase('tr-TR'))
    .filter(Boolean)

  if (normalized.length === 0) return null

  const matchesAny = (keywords: string[]) =>
    normalized.some(proc => keywords.some(kw => proc.includes(kw)))

  const matchedDays: number[] = []
  const matchedLabels: string[] = []
  const matchedReasons: string[] = []

  if (matchesAny(POST_OP_7_DAY_KEYWORDS)) {
    matchedDays.push(7)
    matchedLabels.push('7 Gün (Cerrahi / Dikiş)')
    matchedReasons.push('Planda cerrahi / greft / operasyon işlemi yer aldığı için TDB klinik akışına göre 7. günde yara ve dikiş kontrolü önerilir.')
  }

  if (matchesAny(MONTHLY_30_DAY_KEYWORDS)) {
    matchedDays.push(30)
    matchedLabels.push('1 Ay / 30 Gün (Aktif Takip)')
    matchedReasons.push('Planda ortodontik tedavi, plak/splint veya ara seans işlemi yer aldığı için aylık (30 gün) kontrol önerilir.')
  }

  if (matchesAny(QUARTERLY_90_DAY_KEYWORDS)) {
    matchedDays.push(90)
    matchedLabels.push('3 Ay / 90 Gün (İmplant / Perio)')
    matchedReasons.push('Planda implant, periapikal lezyonlu kanal veya ileri periodontal işlem yer aldığı için 90. günde (3 ay) osteointegrasyon/iyileşme kontrolü önerilir.')
  }

  if (matchesAny(SIX_MONTH_180_DAY_KEYWORDS)) {
    matchedDays.push(180)
    matchedLabels.push('6 Ay / 180 Gün (Rutin Kontrol)')
    matchedReasons.push('Restoratif, endodontik, protetik veya detartraj/flor işlemleri için standart 6 ayda bir (180 gün) kontrol önerilir.')
  }

  if (matchesAny(YEARLY_365_DAY_KEYWORDS)) {
    matchedDays.push(365)
    matchedLabels.push('1 Yıl / 365 Gün (Yıllık Kontrol)')
    matchedReasons.push('Hareketli protez ve genel takip işlemleri için yıllık (365 gün) uyum ve kontrol randevusu önerilir.')
  }

  if (matchedDays.length > 0) {
    return {
      periodic: true,
      days: matchedDays[0],
      daysList: matchedDays,
      badge: matchedLabels.join(' + '),
      reason: matchedReasons.join(' '),
    }
  }

  const allDiagnostic = normalized.every(proc =>
    NO_REMINDER_DIAGNOSTIC_KEYWORDS.some(kw => proc.includes(kw))
  )
  if (allDiagnostic) {
    return {
      periodic: false,
      days: 180,
      badge: 'Kapalı (Tek Seferlik Tetkik / İşlem)',
      reason: 'Planda yalnızca teşhis/röntgen/anestezi işlemleri bulunduğu için hatırlatma kapatılabilir.',
    }
  }

  return null
}

