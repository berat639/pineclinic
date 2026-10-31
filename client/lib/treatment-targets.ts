export type TreatmentScope = 'tooth' | 'jaw' | 'mouth'

export function treatmentTargets(scope: TreatmentScope, teeth: Array<number | string>): string[] {
  if (scope === 'mouth') return ['general']
  const raw = [...new Set(teeth)]
  const validTeeth = raw.map(Number).filter(tooth => Number.isInteger(tooth) && /^[1-4][1-8]$/.test(String(tooth)))
  if (scope === 'jaw') {
    const jaws = new Set<string>()
    for (const item of raw) {
      if (item === 'upper' || item === 'lower') jaws.add(item)
    }
    if (validTeeth.some(tooth => tooth < 30)) jaws.add('upper')
    if (validTeeth.some(tooth => tooth >= 30)) jaws.add('lower')
    return [...jaws]
  }
  return validTeeth.map(String)
}
