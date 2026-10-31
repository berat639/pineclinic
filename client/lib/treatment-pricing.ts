/** Money is represented as integer kuruş; percentages are basis points. */
export interface PriceLine {
  basePriceMinor: number
  materials: { quantity: number; unitSalePriceMinor: number }[]
}

function nonnegativeInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} geçersiz`)
  return BigInt(value)
}

export function calculateTreatmentPrices(lines: PriceLine[], percentBps: number, fixedMinor: number) {
  const percent = nonnegativeInteger(percentBps, 'Yüzde iskonto')
  const fixed = nonnegativeInteger(fixedMinor, 'Manuel iskonto')
  if (percent > BigInt(10000)) throw new Error('Yüzde iskonto 100 değerini aşamaz')
  const amounts = lines.map(line => {
    let amount = nonnegativeInteger(line.basePriceMinor, 'İşlem fiyatı')
    for (const material of line.materials) {
      const quantity = nonnegativeInteger(material.quantity, 'Malzeme miktarı')
      if (quantity === BigInt(0)) throw new Error('Malzeme miktarı en az 1 olmalıdır')
      amount += quantity * nonnegativeInteger(material.unitSalePriceMinor, 'Malzeme satış fiyatı')
    }
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Satır tutarı çok yüksek')
    return amount
  })
  const subtotal = amounts.reduce((sum, amount) => sum + amount, BigInt(0))
  if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Plan tutarı çok yüksek')
  const percentageDiscount = (subtotal * percent + BigInt(5000)) / BigInt(10000)
  if (fixed > subtotal - percentageDiscount) throw new Error('Manuel iskonto kalan tutarı aşamaz')
  const total = subtotal - percentageDiscount - fixed

  // Allocate net value proportionally. Distribute leftover kuruş in stable row
  // order so the sum always equals the total shown on screen.
  const allocated = amounts.map(amount => subtotal === BigInt(0) ? BigInt(0) : amount * total / subtotal)
  let remainder = total - allocated.reduce((sum, amount) => sum + amount, BigInt(0))
  for (let i = 0; remainder > BigInt(0) && i < allocated.length; i++) {
    if (amounts[i] > BigInt(0)) { allocated[i] += BigInt(1); remainder -= BigInt(1) }
  }
  return {
    subtotalMinor: Number(subtotal),
    percentageDiscountMinor: Number(percentageDiscount),
    fixedDiscountMinor: Number(fixed),
    totalMinor: Number(total),
    lineNetMinor: allocated.map(Number),
  }
}
