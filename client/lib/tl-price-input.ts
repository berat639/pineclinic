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
