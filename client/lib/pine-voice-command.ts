import {
  DEFAULT_DENTAL_INDICATIONS,
  DEFAULT_DENTAL_PROCEDURES,
  extractAllFdiTeethInOrder,
  extractDentalSurfaces,
  matchDentalProcedureName,
  matchSpokenMaterials,
  mergeBufferedTeethWithCommand,
  normalizeDentalCommandNumbers,
  parseStructuredOrLocalDentalCommand,
  pickBestSpeechAlternative,
  repairTurkishDentalPhonetics,
  resolveAutoLinkedIndications,
  type InventoryMaterialItem,
  type MatchedVoiceMaterial,
  type SpeechAlternativeItem,
  type VoiceCommandIntent,
  type VoiceSelectIntent,
} from './dental-voice-parser'
import { getLinkedIndicationsForProcedure, type IndicationProcedureLinks } from '../app/admin/components/IndicationProcedureLinker'
import type { ToothRegion } from '../app/admin/components/ToothAnatomy2D'

export interface PineVoiceExecutionAction {
  intent: VoiceCommandIntent
  toothNumbers: string[]
  procedure: any | null
  procedureName: string | null
  indications: string[]
  surfaces: string[]
  sections: ToothRegion[]
  materials: MatchedVoiceMaterial[]
}

export interface PineVoiceParseOutcome {
  matched: boolean
  normalizedText: string
  closeRequested: boolean
  globalIntent: 'NONE' | 'CONFIRM'
  selectIntent: VoiceSelectIntent
  targetTeeth: string[]
  actions: PineVoiceExecutionAction[]
}

function toTrLower(input: string): string {
  return (input || '').toLocaleLowerCase('tr-TR')
}

function normalizeAsciiTr(input: string): string {
  return toTrLower(input)
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

const ONES_WORD_TO_DIGIT: Record<string, number> = {
  bir: 1,
  birinci: 1,
  iki: 2,
  ikinci: 2,
  üç: 3,
  uc: 3,
  üçüncü: 3,
  ucuncu: 3,
  dört: 4,
  dort: 4,
  dördüncü: 4,
  dorduncu: 4,
  beş: 5,
  bes: 5,
  beşinci: 5,
  besinci: 5,
  altı: 6,
  alti: 6,
  altıncı: 6,
  altinci: 6,
  yedi: 7,
  yedinci: 7,
  sekiz: 8,
  sekizinci: 8,
}

/**
 * Converts Turkish quadrant phrases like "sağ alt 6", "sol üst altı", "üst sağ 1", "3. kadran 6"
 * into standard FDI tooth numbers ("46", "26", "11", "36").
 */
export function normalizeQuadrantToothPhrases(rawText: string): string {
  if (!rawText) return ''
  let text = rawText

  const resolveUnit = (token: string): number | null => {
    const clean = toTrLower(token).replace(/[^a-z0-9çğıöşü]/g, '')
    if (/^[1-8]$/.test(clean)) return Number(clean)
    if (clean in ONES_WORD_TO_DIGIT) return ONES_WORD_TO_DIGIT[clean]
    return null
  }

  const unitPattern = '(?:[1-8]|bir(?:inci)?|iki(?:nci)?|üç(?:üncü)?|uc(?:uncu)?|dört|dort|dördüncü|dorduncu|beş(?:inci)?|bes(?:inci)?|altı(?:ncı)?|alti(?:nci)?|yedi(?:nci)?|sekiz(?:inci)?)'
  const startBoundary = '(?<![a-z0-9çğıöşü])'
  const endBoundary = '(?![a-z0-9çğıöşü])'

  // Sağ üst / Üst sağ -> Quadrant 1 (11-18)
  text = text.replace(
    new RegExp(`${startBoundary}(?:sağ\\s+üst|sag\\s+ust|üst\\s+sağ|ust\\s+sag|1\\.?\\s*kadran|birinci\\s+kadran)\\s+(?:diş\\s+|numara\\s+)?(${unitPattern})${endBoundary}`, 'gi'),
    (full, unitTok) => {
      const u = resolveUnit(unitTok)
      return u ? `1${u}` : full
    }
  )

  // Sol üst / Üst sol -> Quadrant 2 (21-28)
  text = text.replace(
    new RegExp(`${startBoundary}(?:sol\\s+üst|sol\\s+ust|üst\\s+sol|ust\\s+sol|2\\.?\\s*kadran|ikinci\\s+kadran)\\s+(?:diş\\s+|numara\\s+)?(${unitPattern})${endBoundary}`, 'gi'),
    (full, unitTok) => {
      const u = resolveUnit(unitTok)
      return u ? `2${u}` : full
    }
  )

  // Sol alt / Alt sol -> Quadrant 3 (31-38)
  text = text.replace(
    new RegExp(`${startBoundary}(?:sol\\s+alt|alt\\s+sol|3\\.?\\s*kadran|üçüncü\\s+kadran|ucuncu\\s+kadran)\\s+(?:diş\\s+|numara\\s+)?(${unitPattern})${endBoundary}`, 'gi'),
    (full, unitTok) => {
      const u = resolveUnit(unitTok)
      return u ? `3${u}` : full
    }
  )

  // Sağ alt / Alt sağ -> Quadrant 4 (41-48)
  text = text.replace(
    new RegExp(`${startBoundary}(?:sağ\\s+alt|sag\\s+alt|alt\\s+sağ|alt\\s+sag|4\\.?\\s*kadran|dördüncü\\s+kadran|dorduncu\\s+kadran)\\s+(?:diş\\s+|numara\\s+)?(${unitPattern})${endBoundary}`, 'gi'),
    (full, unitTok) => {
      const u = resolveUnit(unitTok)
      return u ? `4${u}` : full
    }
  )

  return text
}

/**
 * Extracts all anatomical sub-layers (ToothRegion) mentioned in a spoken Turkish command.
 */
export function extractSpokenAnatomicalRegions(text: string): ToothRegion[] {
  if (!text) return []
  const ascii = normalizeAsciiTr(text)
  const regions: ToothRegion[] = []
  const add = (r: ToothRegion) => {
    if (!regions.includes(r)) regions.push(r)
  }

  if (/\b(tum katmanlar|butun katmanlar|tum alt katmanlar|hepsini sec)\b/.test(ascii)) {
    return ['enamel', 'dentin', 'pulp', 'root-canal', 'crown', 'neck', 'root', 'apex', 'gingiva', 'jaw-bone']
  }

  if (/(?<![a-z])(mine|enamel)(?![a-z])/.test(ascii)) add('enamel')
  if (/(?<![a-z])(dentin)(?![a-z])/.test(ascii)) add('dentin')
  if (/(?<![a-z])(pulpa|sinir odasi)(?![a-z])/.test(ascii)) add('pulp')
  if (/(?<![a-z])(kok kanali|kok kanallari|kanal sistemi)(?![a-z])/.test(ascii)) add('root-canal')
  if (/(?<![a-z])(tac|kuron|kron)(?![a-z])/.test(ascii) && !/\bzirkonyum\s+(?:kuron|kron)\b/.test(ascii)) {
    add('crown')
  }
  if (/(?<![a-z])(boyun|kole|servikal)(?![a-z])/.test(ascii)) add('neck')
  if (/(?<![a-z])(kok ucu|apeks|apikal foramen)(?![a-z])/.test(ascii)) add('apex')
  if (/(?<![a-z])(kok|kok govdesi)(?![a-z])/.test(ascii) && !regions.includes('root-canal') && !regions.includes('apex')) {
    add('root')
  }
  if (/(?<![a-z])(dis eti|gingiva)(?![a-z])/.test(ascii)) add('gingiva')
  if (/(?<![a-z])(cene kemigi|alveol kemigi|alveol|kemik)(?![a-z])/.test(ascii)) add('jaw-bone')

  return regions
}

/**
 * Extracts spoken indications from natural Turkish speech (both "Endikasyonu: Çürük" and natural "36 çürük kompozit dolgu").
 */
export function extractSpokenIndications(
  text: string,
  catalogIndications: string[] = DEFAULT_DENTAL_INDICATIONS
): string[] {
  if (!text) return []
  const ascii = normalizeAsciiTr(text)
  const effectiveInds =
    Array.isArray(catalogIndications) && catalogIndications.length > 0
      ? catalogIndications
      : DEFAULT_DENTAL_INDICATIONS

  const matched: string[] = []
  const seen = new Set<string>()
  const pushInd = (name: string) => {
    const key = normalizeAsciiTr(name)
    if (key && !seen.has(key)) {
      seen.add(key)
      matched.push(name)
    }
  }

  // Sort longer indication names first so "Derin Çürük" matches before "Çürük"
  const sortedCatalog = [...effectiveInds].sort((a, b) => b.length - a.length)
  for (const ind of sortedCatalog) {
    const indAscii = normalizeAsciiTr(ind).trim()
    if (!indAscii || indAscii.length < 3) continue
    const pattern = new RegExp(`(?<![a-z0-9])${indAscii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i')
    if (pattern.test(ascii)) {
      pushInd(ind)
    }
  }

  // Common clinical indication synonyms if not already matched
  const synonyms: Array<{ regex: RegExp; fallback: string }> = [
    { regex: /\b(derin\s+curuk|sekonder\s+curuk)\b/i, fallback: 'Derin Çürük' },
    { regex: /\b(curuk|curugu|karies)\b/i, fallback: 'Çürük' },
    { regex: /\b(pulpitis|pulpit)\b/i, fallback: 'Pulpitis' },
    { regex: /\b(apikal\s+lezyon|lezyon|periapikal)\b/i, fallback: 'Apikal Lezyon' },
    { regex: /\b(kok\s+kirigi)\b/i, fallback: 'Kök Kırığı' },
    { regex: /\b(kirik|kirigi|fraktur)\b/i, fallback: 'Kırık' },
    { regex: /\b(agri|agrisi|hassasiyet)\b/i, fallback: 'Ağrı' },
    { regex: /\b(abse|apse|enfeksiyon)\b/i, fallback: 'Abse' },
  ]

  for (const syn of synonyms) {
    if (syn.regex.test(ascii)) {
      const fromCat = effectiveInds.find(i => normalizeAsciiTr(i) === normalizeAsciiTr(syn.fallback))
      pushInd(fromCat || syn.fallback)
    }
  }

  return matched
}

/**
 * Safely picks the best speech alternative from a SpeechRecognitionResult or array of alternatives.
 * Fixes the bug where object arrays were passed instead of string[] or string[] instead of SpeechAlternativeItem[].
 */
export function safePickBestAlternative(
  rawResultOrAlternatives: any,
  procedures: Array<{ name?: string } | string> = [],
  indications: string[] = [],
  inventory: InventoryMaterialItem[] = []
): string {
  const procNameStrings: string[] = (procedures || [])
    .map(p => (typeof p === 'string' ? p : p?.name || ''))
    .filter(Boolean)

  const matNameStrings: string[] = [
    ...(indications || []).filter(Boolean),
    ...(inventory || []).map(m => m?.name || '').filter(Boolean),
  ]

  const altItems: SpeechAlternativeItem[] = []
  if (Array.isArray(rawResultOrAlternatives)) {
    for (const item of rawResultOrAlternatives) {
      if (typeof item === 'string') {
        if (item.trim()) altItems.push({ transcript: normalizeQuadrantToothPhrases(item.trim()), confidence: 0.8 })
      } else if (item && typeof item.transcript === 'string') {
        const tr = item.transcript.trim()
        if (tr) altItems.push({ transcript: normalizeQuadrantToothPhrases(tr), confidence: item.confidence })
      }
    }
  } else if (rawResultOrAlternatives && typeof rawResultOrAlternatives.length === 'number') {
    for (let i = 0; i < rawResultOrAlternatives.length; i++) {
      const alt = rawResultOrAlternatives[i]
      const tr = (alt?.transcript || '').trim()
      if (tr) {
        altItems.push({
          transcript: normalizeQuadrantToothPhrases(tr),
          confidence: alt?.confidence,
        })
      }
    }
  }

  if (altItems.length === 0) return ''
  return pickBestSpeechAlternative(altItems, procNameStrings, matNameStrings)
}

export function isCloseVoiceCommand(rawText: string): boolean {
  if (!rawText) return false
  const ascii = normalizeAsciiTr(rawText).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!ascii) return false
  if (ascii === 'kapat' || ascii === 'durdur' || ascii === 'bitir') return true
  const hasSubject = /\b(asistan|asistani|dinleme|dinlemeyi|mikrofon|mikrofonu|ses|sesi|sesli komut|sesli komutu)\b/.test(ascii)
  const hasVerb = /\b(kapat|kapatilsin|durdur|durdurulsun|bitir|bitirilsin|sonlandir)\b/.test(ascii)
  return hasSubject && hasVerb
}

/**
 * Matches a procedure object from the catalog (`p.procedures`) given spoken text.
 */
export function resolveCatalogProcedure(
  spokenText: string,
  procedures: any[] = []
): { procedure: any | null; procedureName: string | null } {
  const procNames = (procedures || []).map(p => p?.name).filter(Boolean)
  const matchedName = matchDentalProcedureName(spokenText, procNames.length > 0 ? procNames : DEFAULT_DENTAL_PROCEDURES)
  if (!matchedName) {
    return { procedure: null, procedureName: null }
  }
  const matchedAscii = normalizeAsciiTr(matchedName)
  const matchedBaseAscii = normalizeAsciiTr(matchedName.replace(/\(.*?\)/g, '')).trim()

  const found =
    (procedures || []).find(p => normalizeAsciiTr(p?.name || '') === matchedAscii) ||
    (procedures || []).find(p => {
      const pAscii = normalizeAsciiTr(p?.name || '')
      return pAscii.includes(matchedAscii) || matchedAscii.includes(pAscii) || (matchedBaseAscii.length >= 3 && pAscii.includes(matchedBaseAscii))
    }) ||
    null

  if (found) {
    return { procedure: found, procedureName: found.name }
  }

  return {
    procedure: {
      id: undefined,
      name: matchedName,
      price:
        matchedName.includes('İmplant') ? 12000 :
        matchedName.includes('Zirkonyum') ? 5000 :
        matchedName.includes('Kanal') ? 3000 :
        matchedName.includes('Dolgu') ? 1500 :
        matchedName.includes('Çekim') ? 1000 : 1500,
      scope: matchedName.includes('Detertraj') ? 'mouth' : 'tooth',
      color:
        matchedName.includes('İmplant') ? '#0d9488' :
        matchedName.includes('Zirkonyum') ? '#d97706' :
        matchedName.includes('Kanal') ? '#8b5cf6' :
        matchedName.includes('Çekim') ? '#ef4444' : '#0284c7',
      materials: [],
    },
    procedureName: matchedName,
  }
}

/**
 * Parses a Turkish dental voice command locally and deterministically, supporting:
 * - Spoken FDI numbers ("36", "15 16 17"), Turkish number words ("otuz altı", "on sekiz"),
 *   quadrant phrases ("sağ alt 6", "sol üst 8"), and ranges ("11-14 arası")
 * - Currently selected teeth on screen (`selectedTeeth`) when no tooth number is spoken
 * - Single or multi-clause commands ("36 kompozit dolgu ve 18 diş çekimi")
 * - Procedures, indications (spoken + auto-linked via `indicationLinks`), surfaces (MODBL), anatomical sub-layers, and materials
 */
export function parsePineVoiceCommand(
  rawText: string,
  options: {
    procedures?: any[]
    indications?: string[]
    inventory?: InventoryMaterialItem[]
    indicationLinks?: IndicationProcedureLinks
    bufferedTeeth?: string[]
    selectedTeeth?: number[]
  } = {}
): PineVoiceParseOutcome {
  const {
    procedures = [],
    indications = [],
    inventory = [],
    indicationLinks = {},
    bufferedTeeth = [],
    selectedTeeth = [],
  } = options

  const preNormalized = normalizeQuadrantToothPhrases(rawText || '')
  const merged =
    bufferedTeeth.length > 0
      ? mergeBufferedTeethWithCommand(bufferedTeeth, preNormalized)
      : repairTurkishDentalPhonetics(preNormalized)
  const normalizedText = repairTurkishDentalPhonetics(normalizeDentalCommandNumbers(merged))

  const empty: PineVoiceParseOutcome = {
    matched: false,
    normalizedText,
    closeRequested: false,
    globalIntent: 'NONE',
    selectIntent: 'NONE',
    targetTeeth: [],
    actions: [],
  }

  if (!normalizedText) return empty

  if (isCloseVoiceCommand(normalizedText)) {
    return {
      ...empty,
      matched: true,
      closeRequested: true,
    }
  }

  const procNames = procedures.map(p => p?.name).filter(Boolean)
  const baseParsed = parseStructuredOrLocalDentalCommand(normalizedText, {
    procNames: procNames.length > 0 ? procNames : DEFAULT_DENTAL_PROCEDURES,
    indNames: indications.length > 0 ? indications : DEFAULT_DENTAL_INDICATIONS,
    inventory,
    indicationLinks,
    bufferedTeeth,
  })

  if (baseParsed.globalIntent === 'CONFIRM') {
    return {
      ...empty,
      matched: true,
      globalIntent: 'CONFIRM',
    }
  }

  // Split multi-action commands if the doctor says e.g. "36 kompozit dolgu, 18 diş çekimi"
  const subClauses = normalizedText
    .split(/\s+(?:ve\s+(?=[1-4][1-8]\b)|ayrıca\s+|ardından\s+|sonra\s+)\s*|\s*;\s*/i)
    .map(s => s.trim())
    .filter(Boolean)

  if (subClauses.length > 1) {
    const multiActions: PineVoiceExecutionAction[] = []
    const allTargets: string[] = []
    for (const clause of subClauses) {
      const subOutcome = parseSingleClauseCommand(clause, {
        procedures,
        indications,
        inventory,
        indicationLinks,
        selectedTeeth,
      })
      if (subOutcome.actions.length > 0) {
        multiActions.push(...subOutcome.actions)
        for (const t of subOutcome.targetTeeth) {
          if (!allTargets.includes(t)) allTargets.push(t)
        }
      }
    }
    if (multiActions.length > 0) {
      return {
        matched: true,
        normalizedText,
        closeRequested: false,
        globalIntent: 'NONE',
        selectIntent: allTargets.length > 0 ? 'SELECT_TEETH' : baseParsed.selectIntent,
        targetTeeth: allTargets,
        actions: multiActions,
      }
    }
  }

  const singleOutcome = parseSingleClauseCommand(normalizedText, {
    procedures,
    indications,
    inventory,
    indicationLinks,
    selectedTeeth,
    baseParsed,
  })

  return singleOutcome
}

function parseSingleClauseCommand(
  normalizedText: string,
  options: {
    procedures: any[]
    indications: string[]
    inventory: InventoryMaterialItem[]
    indicationLinks: IndicationProcedureLinks
    selectedTeeth: number[]
    baseParsed?: ReturnType<typeof parseStructuredOrLocalDentalCommand>
  }
): PineVoiceParseOutcome {
  const { procedures, indications, inventory, indicationLinks, selectedTeeth } = options
  const procNames = procedures.map(p => p?.name).filter(Boolean)
  const baseParsed =
    options.baseParsed ||
    parseStructuredOrLocalDentalCommand(normalizedText, {
      procNames: procNames.length > 0 ? procNames : DEFAULT_DENTAL_PROCEDURES,
      indNames: indications.length > 0 ? indications : DEFAULT_DENTAL_INDICATIONS,
      inventory,
      indicationLinks,
    })

  const spokenTeeth = extractAllFdiTeethInOrder(normalizedText)
  const { procedure, procedureName } = resolveCatalogProcedure(normalizedText, procedures)
  const spokenInds = extractSpokenIndications(normalizedText, indications)
  const surfaces = extractDentalSurfaces(normalizedText)
  const sections = extractSpokenAnatomicalRegions(normalizedText)
  const materials = matchSpokenMaterials(normalizedText, inventory)

  const ascii = normalizeAsciiTr(normalizedText)
  const isDelete =
    baseParsed.intent === 'DELETE' ||
    /(?<![a-z])(sil|silinsin|silelim|kaldir|kaldirilsin|cikar|cikart|iptal)(?![a-z])/.test(ascii)
  const isUpdate =
    baseParsed.intent === 'UPDATE' ||
    /(?<![a-z])(duzenle|duzenlensin|degistir|degistirilsin|guncelle|guncellensin)(?![a-z])/.test(ascii)
  const intent: VoiceCommandIntent = isDelete ? 'DELETE' : isUpdate ? 'UPDATE' : 'ADD'

  // Pure selection command (e.g. "üst çeneyi seç", "16 17 seç", "seçimi temizle")
  if (!procedureName && spokenInds.length === 0 && surfaces.length === 0 && sections.length === 0 && !isDelete) {
    if (baseParsed.selectIntent !== 'NONE') {
      return {
        matched: true,
        normalizedText,
        closeRequested: false,
        globalIntent: 'NONE',
        selectIntent: baseParsed.selectIntent,
        targetTeeth: spokenTeeth,
        actions: [],
      }
    }
    return {
      matched: false,
      normalizedText,
      closeRequested: false,
      globalIntent: 'NONE',
      selectIntent: 'NONE',
      targetTeeth: [],
      actions: [],
    }
  }

  // Determine target teeth:
  // 1. Spoken FDI teeth in command ("36", "15 16 17")
  // 2. Jaw/mouth scope or selection intent ("tüm üst çene", "tüm ağız")
  // 3. Currently selected teeth on screen (`selectedTeeth`) if user already selected a tooth and spoke a procedure/indication/surface/layer!
  let resolvedTeeth: string[] = [...spokenTeeth]
  if (resolvedTeeth.length === 0) {
    if (procedure?.scope === 'mouth' || /(tum agiz|butun agiz|genel)/.test(ascii)) {
      resolvedTeeth = ['general']
    } else if (baseParsed.selectIntent === 'SELECT_MAXILLA' || /(ust cene)/.test(ascii)) {
      resolvedTeeth = procedure?.scope === 'jaw'
        ? ['upper']
        : ['11', '12', '13', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '26', '27', '28']
    } else if (baseParsed.selectIntent === 'SELECT_MANDIBLE' || /(alt cene)/.test(ascii)) {
      resolvedTeeth = procedure?.scope === 'jaw'
        ? ['lower']
        : ['31', '32', '33', '34', '35', '36', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48']
    } else if (Array.isArray(selectedTeeth) && selectedTeeth.length > 0) {
      resolvedTeeth = selectedTeeth.map(String)
    }
  }

  if (resolvedTeeth.length === 0) {
    // Still no target teeth and not a mouth-wide procedure -> cannot execute yet
    return {
      matched: false,
      normalizedText,
      closeRequested: false,
      globalIntent: 'NONE',
      selectIntent: 'NONE',
      targetTeeth: [],
      actions: [],
    }
  }

  // Combine spoken indications + auto-linked indications from Step 3 (indicationLinks)
  let finalIndications: string[] = [...spokenInds]
  if (intent !== 'DELETE' && procedureName) {
    const linkedFromHelper = procedure
      ? getLinkedIndicationsForProcedure(indicationLinks, procedure, spokenInds)
      : []
    const extraPrefixedLinks: string[] = []
    if (procedure?.id && indicationLinks?.[`id:${procedure.id}`]) {
      extraPrefixedLinks.push(...indicationLinks[`id:${procedure.id}`])
    }
    if (procedureName && indicationLinks?.[`name:${procedureName}`]) {
      extraPrefixedLinks.push(...indicationLinks[`name:${procedureName}`])
    }
    const linkedFromVoice = resolveAutoLinkedIndications(
      procedureName,
      indicationLinks,
      spokenInds,
      procedure?.id
    )
    const mergedSet = new Set<string>(
      [...spokenInds, ...linkedFromHelper, ...extraPrefixedLinks, ...linkedFromVoice].filter(Boolean)
    )
    finalIndications = Array.from(mergedSet)
  }

  const action: PineVoiceExecutionAction = {
    intent,
    toothNumbers: resolvedTeeth,
    procedure,
    procedureName,
    indications: finalIndications,
    surfaces,
    sections,
    materials,
  }

  return {
    matched: true,
    normalizedText,
    closeRequested: false,
    globalIntent: 'NONE',
    selectIntent: spokenTeeth.length > 0 ? 'SELECT_TEETH' : baseParsed.selectIntent,
    targetTeeth: spokenTeeth.length > 0 ? spokenTeeth : resolvedTeeth.filter(t => /^[1-4][1-8]$/.test(t)),
    actions: [action],
  }
}
