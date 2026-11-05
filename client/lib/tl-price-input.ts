/** Turkish notation: dots group thousands; a comma separates kuruş. */
export function maskTlPrice(value: string): string | null {
  const cleaned = value.replace(/\s|₺|TL/gi, '')
  if (!/^[\d.]*([,]\d{0,2})?$/.test(cleaned)) return null
  const [whole, fraction] = cleaned.replace(/\./g, '').split(',')
  const digits = whole.replace(/^0+(?=\d)/, '')
  if (!digits && fraction === undefined) return ''
  const grouped = (digits || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return fraction === undefined ? grouped : `${grouped},${fraction}`
}

export function tlPriceToMinor(value: string): number {
  if (!value) return NaN
  const [whole, fraction = ''] = value.replace(/\./g, '').split(',')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/**
 * Formats a numeric TL amount (e.g. 1250 or 1250.5) into Turkish display string
 * with thousand dots (`1.250`, `1.250,50`). Returns `""` when amount <= 0 so
 * inputs display their `"0"` placeholder without a sticky leading zero.
 */
export function formatTlAmountDisplay(amountTl: number | null | undefined): string {
  if (amountTl === null || amountTl === undefined || !Number.isFinite(amountTl) || amountTl <= 0) {
    return ''
  }
  const minor = Math.round(amountTl * 100)
  if (minor <= 0) return ''
  const whole = Math.floor(minor / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const frac = minor % 100
  if (frac === 0) return whole
  const fracStr = frac % 10 === 0 ? String(frac / 10) : String(frac).padStart(2, '0')
  return `${whole},${fracStr}`
}

/**
 * Masks and clamps a Turkish manual discount input (`Manuel iskonto ₺`) against
 * the maximum allowed minor units (remaining subtotal after percentage discount).
 */
export function maskAndClampTlDiscount(
  rawValue: string,
  maxAllowedMinor?: number | null
): { display: string; amountTl: number; amountMinor: number } | null {
  const normalizedRaw = rawValue.replace(/\s|₺|TL/gi, '')
  if (!normalizedRaw) {
    return { display: '', amountTl: 0, amountMinor: 0 }
  }
  const masked = maskTlPrice(normalizedRaw)
  if (masked === null) return null
  if (!masked) {
    return { display: '', amountTl: 0, amountMinor: 0 }
  }

  const parsedMinor = tlPriceToMinor(masked)
  if (!Number.isFinite(parsedMinor) || parsedMinor < 0) {
    return { display: '', amountTl: 0, amountMinor: 0 }
  }

  const hasMax = typeof maxAllowedMinor === 'number' && Number.isFinite(maxAllowedMinor)
  const capMinor = hasMax ? Math.max(0, Math.floor(maxAllowedMinor)) : Number.MAX_SAFE_INTEGER

  if (parsedMinor > capMinor) {
    if (capMinor <= 0) {
      return { display: '', amountTl: 0, amountMinor: 0 }
    }
    const clampedTl = capMinor / 100
    const whole = Math.floor(capMinor / 100)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const frac = capMinor % 100
    const clampedDisplay =
      frac === 0 ? whole : `${whole},${String(frac).padStart(2, '0')}`
    return {
      display: clampedDisplay,
      amountTl: clampedTl,
      amountMinor: capMinor,
    }
  }

  if (parsedMinor === 0 && !masked.includes(',')) {
    return { display: '', amountTl: 0, amountMinor: 0 }
  }

  return {
    display: masked,
    amountTl: parsedMinor / 100,
    amountMinor: parsedMinor,
  }
}

/**
 * Formats a percentage discount (`0` - `100`) for display. Returns `""` when `0`
 * so the input shows its `"0"` placeholder without a sticky leading zero.
 */
export function formatPercentDiscountDisplay(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent) || percent <= 0) {
    return ''
  }
  const clamped = Math.min(100, Math.max(0, Math.round(percent * 100) / 100))
  if (clamped <= 0) return ''
  return String(clamped).replace('.', ',')
}

/**
 * Masks and clamps a percentage discount input (`İskonto %`) between `0` and `100`.
 */
export function maskAndClampPercentDiscount(
  rawValue: string
): { display: string; percent: number } | null {
  const cleaned = rawValue.replace(/\s|%/g, '').replace(/\./g, ',')
  if (!cleaned) {
    return { display: '', percent: 0 }
  }
  if (!/^\d*(,\d{0,2})?$/.test(cleaned)) return null

  const [wholeRaw, fraction] = cleaned.split(',')
  const wholeDigits = wholeRaw.replace(/^0+(?=\d)/, '')
  if (!wholeDigits && fraction === undefined) {
    return { display: '', percent: 0 }
  }

  const wholeNum = Number(wholeDigits || '0')
  const fracNum = fraction ? Number(fraction.padEnd(2, '0')) : 0
  const totalBps = wholeNum * 100 + fracNum

  if (totalBps > 10000) {
    return { display: '100', percent: 100 }
  }

  if (totalBps === 0 && fraction === undefined) {
    return { display: '', percent: 0 }
  }

  const displayWhole = wholeDigits || '0'
  const display = fraction === undefined ? displayWhole : `${displayWhole},${fraction}`
  return {
    display,
    percent: totalBps / 100,
  }
}

function normalizeTrAscii(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim()
}

const NON_MATERIAL_CATEGORY_PATTERNS = [
  'cihaz',
  'makina',
  'makine',
  'ekipman',
  'demirbas',
  'sabit kiymet',
  'donanim',
  'hardware',
  'machine',
  'equipment',
  'device',
  'asset',
  'rontgen',
  'tomografi',
  'otoklav',
  'kompresor',
  'tarayici',
  'scanner',
  'mikromotor',
  'aerator',
  'anguldruva',
  'kavitron',
  'sterilizator',
]

const NON_MATERIAL_NAME_SUBSTRINGS = [
  'makina',
  'makine',
  'cihaz',
  'ekipman',
  'demirbas',
  'otoklav',
  'sterilizator',
  'rontgen',
  'panoramik',
  'sefalometrik',
  'tomografi',
  'cbct',
  'rvg',
  'kompresor',
  'tarayici',
  'scanner',
  'cad/cam',
  'cad-cam',
  '3d yazici',
  '3d printer',
  'intraoral kamera',
  'agiz ici kamera',
  'mikromotor',
  'aerator',
  'anguldruva',
  'piyasemen',
  'turbin',
  'kavitron',
  'ultrasonik scaler',
  'piezo cerrahi',
  'fizyodispenser',
  'endomotor',
  'apeks bulucu',
  'apex locator',
  'amalgamator',
  'dis uniti',
  'dis unit',
  'fotoy',
  'reflektor',
  'machine',
  'equipment',
  'device',
]

const NON_MATERIAL_NAME_WORD_REGEX = /(?:^|[\s/().,_-])(unit|uniti|kamera|lazer)(?:$|[\s/().,_-])/i

const CONSUMABLE_OVERRIDE_WORDS = [
  'poset',
  'bant',
  'bandi',
  'frez',
  'frezi',
  'jel',
  'jeli',
  'solusyon',
  'sprey',
  'siman',
  'kompozit',
  'dolgu',
  'greft',
  'membran',
  'eldiven',
  'maske',
  'enjektor',
  'igne',
  'sutur',
  'aljinat',
  'silikon',
  'guta',
  'kanal egesi',
]

/**
 * Returns `true` only for consumable dental materials that can be used in a
 * treatment/procedure, filtering out machines, devices, and clinic equipment.
 */
export function isSelectableTreatmentMaterial(item: any): boolean {
  if (!item || typeof item !== 'object') return false
  if (item.isMachine === true || item.isDevice === true || item.isEquipment === true) {
    return false
  }

  const categoryRaw = [
    item.category,
    item.type,
    item.kind,
    item.recordType,
    item.itemType,
    item.group,
    item.subCategory,
  ]
    .map(normalizeTrAscii)
    .filter(Boolean)
    .join(' ')

  if (categoryRaw) {
    if (NON_MATERIAL_CATEGORY_PATTERNS.some(pattern => categoryRaw.includes(pattern))) {
      return false
    }
    if (/(?:^|[\s/().,_-])(unit|uniti)(?:$|[\s/().,_-])/i.test(categoryRaw)) {
      return false
    }
  }

  const nameNorm = normalizeTrAscii(item.name || item.itemName || item.deviceName)
  if (!nameNorm) return false

  // If the item's name explicitly indicates a machine/device/equipment:
  const hasExplicitMachineWord =
    nameNorm.includes('makina') ||
    nameNorm.includes('makine') ||
    nameNorm.includes('cihaz') ||
    nameNorm.includes('ekipman') ||
    nameNorm.includes('demirbas') ||
    nameNorm.includes('machine') ||
    nameNorm.includes('equipment') ||
    nameNorm.includes('device')

  if (hasExplicitMachineWord) {
    return false
  }

  const matchesDeviceName =
    NON_MATERIAL_NAME_SUBSTRINGS.some(sub => nameNorm.includes(sub)) ||
    NON_MATERIAL_NAME_WORD_REGEX.test(nameNorm)

  if (matchesDeviceName) {
    const isConsumableAccessory = CONSUMABLE_OVERRIDE_WORDS.some(word => nameNorm.includes(word))
    if (!isConsumableAccessory) {
      return false
    }
  }

  return true
}

