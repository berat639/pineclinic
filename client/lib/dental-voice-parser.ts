export interface SpeechAlternativeItem {
  transcript: string;
  confidence?: number;
}

export interface InventoryMaterialItem {
  id: string;
  name: string;
  costPerUnit?: number;
  unitSalePriceMinor?: number;
  quantity?: number;
  [key: string]: any;
}

export interface MatchedVoiceMaterial {
  id: string;
  inventoryItemId: string;
  name: string;
  quantity: number;
  costPerUnit: number;
  unitCost: number;
  unitSalePriceMinor: number;
}

export type VoiceCommandIntent = 'ADD' | 'DELETE' | 'UPDATE';

export type VoiceSelectIntent =
  | 'NONE'
  | 'SELECT_ALL'
  | 'SELECT_MAXILLA'
  | 'SELECT_MANDIBLE'
  | 'SELECT_Q1'
  | 'SELECT_Q2'
  | 'SELECT_Q3'
  | 'SELECT_Q4'
  | 'SELECT_ANTERIOR'
  | 'SELECT_POSTERIOR'
  | 'CLEAR_SELECTION'
  | 'SELECT_TEETH';

export interface ParsedVoiceTreatment {
  procedureName: string | null;
  toothNumbers: string[];
  indication: string | null;
  indications: string[];
  surfaces: string[];
  surface?: string;
  section: 'crown' | 'cervical' | 'root' | null;
  materials: MatchedVoiceMaterial[];
  materialNames: string[];
  cost?: number;
  intent: VoiceCommandIntent;
}

export interface ParsedDentalVoiceResult {
  globalIntent: 'NONE' | 'CONFIRM';
  selectIntent: VoiceSelectIntent;
  targetTeeth: string[];
  treatments: ParsedVoiceTreatment[];
  diseases: Array<{ name: string; intent: VoiceCommandIntent }>;
  consultations: Array<{ name: string; intent: VoiceCommandIntent }>;
  // Convenience top-level fields for direct access in tests and callers
  toothNumbers: string[];
  procedureName: string | null;
  indication: string | null;
  indications: string[];
  surfaces: string[];
  surface?: string;
  section: 'crown' | 'cervical' | 'root' | null;
  materials: MatchedVoiceMaterial[];
  materialNames: string[];
  intent: VoiceCommandIntent | 'NONE';
  normalizedText: string;
  isStructured51: boolean;
  matched: boolean;
}

export interface ParseDentalCommandOptions {
  procNames?: string[];
  indNames?: string[];
  inventory?: InventoryMaterialItem[];
  materialNames?: string[];
  indicationLinks?: Record<string, string | string[]>;
  bufferedTeeth?: string[];
  diseaseNames?: string[];
  consultationNames?: string[];
}

export const DEFAULT_DENTAL_PROCEDURES: string[] = [
  'Kompozit Dolgu (Tek Yüzey)',
  'Kanal Tedavisi (Tek Kanal)',
  'Diş Çekimi',
  'İmplant (Yerli)',
  'Zirkonyum Kuron',
  'Detertraj',
];

export const DEFAULT_DENTAL_INDICATIONS: string[] = [
  'Çürük',
  'Derin Çürük',
  'Kırık',
  'Apikal Lezyon',
  'Kök Kırığı',
  'Ağrı',
];

const TURKISH_TENS_MAP: Record<string, number> = {
  on: 10,
  yirmi: 20,
  otuz: 30,
  kırk: 40,
  kirk: 40,
};

const TURKISH_ONES_MAP: Record<string, number> = {
  bir: 1,
  iki: 2,
  üç: 3,
  uc: 3,
  dört: 4,
  dort: 4,
  beş: 5,
  bes: 5,
  altı: 6,
  alti: 6,
  yedi: 7,
  sekiz: 8,
};

function toTrLower(input: string): string {
  return (input || '').toLocaleLowerCase('tr-TR');
}

function normalizeAsciiTr(input: string): string {
  return toTrLower(input)
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/**
 * Türkçe yazıyla söylenen diş numaralarını ("on beş" -> "15"),
 * bitişik FDI sayılarını ("151617" -> "15 16 17"),
 * başında onlar basamağı yutulmuş serileri ("5 16 17" -> "15 16 17")
 * ve devamında birler basamağı söylenen serileri ("15 6 7" -> "15 16 17", "36 7 8" -> "36 37 38") tamamlar.
 */
export function normalizeDentalCommandNumbers(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();
  if (!text) return '';

  // 1. Türkçe onlar + birler basamağı kelimelerini FDI rakamına çevir ("on beş" -> "15", "otuz altı" -> "36")
  for (const [tenWord, tenVal] of Object.entries(TURKISH_TENS_MAP)) {
    for (const [oneWord, oneVal] of Object.entries(TURKISH_ONES_MAP)) {
      const fdi = String(tenVal + oneVal);
      const pattern = new RegExp(
        `(?<=^|[\\s,.;:!?()\\-])${tenWord}\\s*${oneWord}(?=$|[\\s,.;:!?()\\-])`,
        'gi'
      );
      text = text.replace(pattern, fdi);
    }
    // "on 5", "otuz 6" gibi karma yazımlar
    const mixedTenDigit = new RegExp(
      `(?<=^|[\\s,.;:!?()\\-])${tenWord}\\s+([1-8])(?=$|[\\s,.;:!?()\\-])`,
      'gi'
    );
    text = text.replace(mixedTenDigit, (_, d) => String(tenVal + Number(d)));
  }

  // "10 beş", "30 altı" gibi karma yazımlar
  for (const [oneWord, oneVal] of Object.entries(TURKISH_ONES_MAP)) {
    const mixedDigitOne = new RegExp(
      `(?<=^|[\\s,.;:!?()\\-])([1-4]0)\\s+${oneWord}(?=$|[\\s,.;:!?()\\-])`,
      'gi'
    );
    text = text.replace(mixedDigitOne, (_, tenStr) => String(Number(tenStr) + oneVal));
  }

  // Tek başına yazıyla kalmış birler basamağı (FDI sayısından hemen önce veya sonra: "beş 16 17" -> "5 16 17", "15 altı yedi" -> "15 6 7")
  for (let pass = 0; pass < 3; pass++) {
    for (const [oneWord, oneVal] of Object.entries(TURKISH_ONES_MAP)) {
      const beforeFdiOrDigit = new RegExp(
        `(?<=^|[\\s,.;:!?()\\-])${oneWord}(?=\\s*[,;]?\\s+(?:[1-4][1-8]|[1-8])(?=$|[\\s,.;:!?()\\-]))`,
        'gi'
      );
      text = text.replace(beforeFdiOrDigit, String(oneVal));

      const afterFdiOrDigit = new RegExp(
        `(?<=(?:^|[\\s,.;:!?()\\-])(?:[1-4][1-8]|[1-8])\\s*[,;]?\\s+)${oneWord}(?=$|[\\s,.;:!?()\\-])`,
        'gi'
      );
      text = text.replace(afterFdiOrDigit, String(oneVal));
    }
  }

  // 2. Bitişik yazılmış FDI diş numaralarını ayır ("151617" -> "15 16 17", "363738" -> "36 37 38")
  text = text.replace(/\b((?:[1-4][1-8]){2,8})\b/g, (match) => {
    const pairs: string[] = [];
    for (let i = 0; i < match.length; i += 2) {
      pairs.push(match.slice(i, i + 2));
    }
    return pairs.join(' ');
  });

  // 3. Başlangıçta onlar basamağı yutulmuş ardışık diş serisini geriye doğru tamamla ("5 16 17" -> "15 16 17", "5 6 17" -> "15 16 17")
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(
      /\b([1-8])(\s*[,;]?\s+)(([1-4])([1-8]))\b/g,
      (full, firstDigitStr, sep, secondFdi, quadrantStr, secondUnitStr) => {
        const firstDigit = Number(firstDigitStr);
        const secondUnit = Number(secondUnitStr);
        if (Math.abs(firstDigit - secondUnit) === 1) {
          return `${quadrantStr}${firstDigit}${sep}${secondFdi}`;
        }
        return full;
      }
    );
  }

  // 4. İlk FDI diş numarasından sonra sadece birler basamağı söylenmiş ardışık serileri ileriye doğru tamamla ("15 6 7" -> "15 16 17", "36 7 8" -> "36 37 38")
  for (let pass = 0; pass < 4; pass++) {
    text = text.replace(
      /\b(([1-4])([1-8]))(\s*[,;]?\s+)([1-8])\b(?!\s*(?:tl|lira|₺|bin|yüz|kanal|yüzey|adet|gün|seans))/gi,
      (full, firstFdi, quadrantStr, firstUnitStr, sep, nextDigitStr) => {
        const firstUnit = Number(firstUnitStr);
        const nextDigit = Number(nextDigitStr);
        if (Math.abs(nextDigit - firstUnit) === 1) {
          return `${firstFdi}${sep}${quadrantStr}${nextDigit}`;
        }
        return full;
      }
    );
  }

  // 5. Duraksama nedeniyle yan yana tekrar eden aynı FDI diş numarasını tekilleştir ("15 16 17 17" -> "15 16 17")
  text = text.replace(/\b([1-4][1-8])(?:\s*[,;]?\s+\1)+\b/g, '$1');

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Tarayıcı STT'sinin yaptığı Türkçe dental fonetik hataları ve diş numarası kırpılmalarını düzeltir.
 */
export function repairTurkishDentalPhonetics(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = normalizeDentalCommandNumbers(rawText);
  if (!text) return '';

  // 1. Birleşik kalıplar: "koyun ekmek" / "koyun ekle" / "zirkon ekmek" -> "zirkonyum ekle"
  text = text.replace(
    /\b(?:koyun|zirkon|sirkonyum|zirkonya|sirkon)\s+(?:ekmek|ekle|ekli|ekler|eklensin)\b/gi,
    'zirkonyum ekle'
  );
  text = text.replace(
    /\b(?:koyun|zirkon|sirkonyum|zirkonya|sirkon)\s+(?:sil|silinsin|kaldır|çıkar)\b/gi,
    'zirkonyum sil'
  );

  // 2. Dental bağlamda "koyun", "zirkon", "sirkonyum", "zirkonya" -> "zirkonyum"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:koyun|zirkon|sirkonyum|zirkonya|sirkon)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'zirkonyum'
  );

  // 3. "komplo", "kompozisyon", "kompoze" -> "kompozit"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:komplo|kompozisyon|kompoze)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'kompozit'
  );

  // 4. Yüzey fonetik düzeltmeleri:
  // "bakkal", "bu kal", "bukal" -> "bukkal"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:bakkal|bu\s+kal|bukal|bükal)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'bukkal'
  );
  // "dijital", "destan" -> "distal"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:dijital|destan)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'distal'
  );
  // "mezar", "mesai", "mezial" -> "mezyal"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:mezar|mesai|mezial|mezyel)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'mezyal'
  );
  // "okul", "okluzal", "özel" (yüzey bağlamında) -> "oklüzal"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:okul|okluzal)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'oklüzal'
  );
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])özel(?![a-zA-ZçğıöşüÇĞİÖŞÜ])(?!\s+(?:hastane|klinik|sigorta|not|doktor|hekim))/gi,
    'oklüzal'
  );

  // 5. Yüzey kısaltmaları: "em o de", "m o d", "mod" -> "MOD"; "em o", "m o" -> "MO"; "de o", "d o" -> "DO"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:em\s+o\s+de|m\s+o\s+d|m\.o\.d\.?|mod)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'MOD'
  );
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:em\s+o|m\s+o|m\.o\.?)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'MO'
  );
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:de\s+o|d\s+o|d\.o\.?)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'DO'
  );

  // 6. Cümle sonunda veya dental terim sonrasında "ekmek", "ekli", "ekler" -> "ekle"
  text = text.replace(
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(?:ekmek|ekli|ekler)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi,
    'ekle'
  );
  // "ekle ekle" tekrarını tekilleştir
  text = text.replace(/\bekle\s+ekle\b/gi, 'ekle');

  // Sayı serilerini fonetik düzeltme sonrasında tekrar normalize et (ör. "17 zirkonyum ekle" öncesi birleşmeler için)
  text = normalizeDentalCommandNumbers(text);

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Metin içerisindeki tüm geçerli FDI diş numaralarını (11-48) söyleniş sırasını koruyarak ve tekilleştirerek çıkarır.
 * Aralık ifadelerini ("11-14 arası", "15 den 17 ye kadar") de sırasıyla açar.
 */
export function extractAllFdiTeethInOrder(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const repaired = repairTurkishDentalPhonetics(text);
  if (!repaired) return [];

  const result: string[] = [];
  const seen = new Set<string>();
  const pushTooth = (t: string) => {
    if (/^[1-4][1-8]$/.test(t) && !seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  };

  // Aralık ifadeleri: "15-17", "15 ile 17 arası", "15 den 17 ye kadar"
  let expandedText = repaired.replace(
    /\b([1-4][1-8])\s*(?:-|ile|den|dan|'den|'dan)\s*([1-4][1-8])(?:\s*(?:arası|e\s*kadar|a\s*kadar|ye\s*kadar|ya\s*kadar))?\b/gi,
    (full, startStr, endStr) => {
      const start = Number(startStr);
      const end = Number(endStr);
      const q1 = Math.floor(start / 10);
      const q2 = Math.floor(end / 10);
      if (q1 === q2 && Math.abs(end - start) <= 7) {
        const step = end >= start ? 1 : -1;
        const seq: string[] = [];
        for (let cur = start; step > 0 ? cur <= end : cur >= end; cur += step) {
          seq.push(String(cur));
        }
        return seq.join(' ');
      }
      return full;
    }
  );

  const fdiRegex = /\b([1-4][1-8])\b(?!\s*(?:tl|lira|₺|bin|yüz|adet|gün|dakika|sn|saniye))/gi;
  let match: RegExpExecArray | null;
  while ((match = fdiRegex.exec(expandedText)) !== null) {
    pushTooth(match[1]);
  }

  return result;
}

/**
 * Duraksamalı konuşmada ("15" ... 1sn ... "16" ... 1sn ... "17" ... "17 koyun ekmek")
 * önceki parçalarda yakalanan diş numaralarını son komutla sırasını koruyarak ve mükerrerleri temizleyerek birleştirir.
 */
export function mergeBufferedTeethWithCommand(bufferedTeeth: string[], currentText: string): string {
  const repairedCurrent = repairTurkishDentalPhonetics(currentText || '');
  const bufferExtracted: string[] = [];
  const seen = new Set<string>();

  for (const entry of bufferedTeeth || []) {
    const teethInEntry = extractAllFdiTeethInOrder(String(entry || ''));
    for (const t of teethInEntry) {
      if (!seen.has(t)) {
        seen.add(t);
        bufferExtracted.push(t);
      }
    }
  }

  const currentTeeth = extractAllFdiTeethInOrder(repairedCurrent);
  for (const t of currentTeeth) {
    if (!seen.has(t)) {
      seen.add(t);
      bufferExtracted.push(t);
    }
  }

  if (bufferExtracted.length === 0) {
    return repairedCurrent;
  }

  if (!repairedCurrent) {
    return bufferExtracted.join(' ');
  }

  // Cümlenin başındaki mevcut diş numaralarını ve ayraçları soyup tam diş listesini başa yerleştir
  const withoutLeadingTeeth = repairedCurrent
    .replace(/^(?:\s*(?:[1-4][1-8]|[1-8])\s*[,;.\-]?\s*(?:ve|ile)?\s*)+/i, '')
    .trim();

  if (!withoutLeadingTeeth) {
    return bufferExtracted.join(' ');
  }

  return `${bufferExtracted.join(' ')} ${withoutLeadingTeeth}`.replace(/\s+/g, ' ').trim();
}

/**
 * SpeechRecognitionResult içerisindeki alternatifleri (maxAlternatives) tarar ve
 * FDI diş numarası, dental işlem, yüzey veya malzeme eşleşmesi en güçlü olan adayı seçer.
 */
export function pickBestSpeechAlternative(
  alternatives: Array<SpeechAlternativeItem | string>,
  procNames: Array<string | { name?: string }> = DEFAULT_DENTAL_PROCEDURES,
  materialNames: Array<string | { name?: string }> = []
): string {
  if (!Array.isArray(alternatives) || alternatives.length === 0) return '';

  const extractName = (item: string | { name?: string } | null | undefined): string => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && typeof item.name === 'string') return item.name;
    return '';
  };

  const effectiveProcs = Array.isArray(procNames) && procNames.length > 0 ? procNames : DEFAULT_DENTAL_PROCEDURES;
  const normProcs = effectiveProcs
    .map((p) => normalizeAsciiTr(extractName(p).replace(/\(.*?\)/g, '').trim()))
    .filter(Boolean);
  const normMats = (Array.isArray(materialNames) ? materialNames : [])
    .map((m) => normalizeAsciiTr(extractName(m)))
    .filter(Boolean);

  const dentalCoreKeywords = [
    'zirkonyum',
    'kompozit',
    'dolgu',
    'kanal',
    'cekim',
    'implant',
    'kuron',
    'kron',
    'kaplama',
    'detertraj',
    'endikasyon',
    'endikasyonu',
    'tedavi',
    'yuzey',
    'yuzeyler',
    'curuk',
    'kirik',
    'okluzal',
    'mezyal',
    'distal',
    'bukkal',
    'lingual',
    'palatinal',
    'ekle',
    'sil',
  ];

  let bestTranscript = '';
  let bestScore = -Infinity;

  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i];
    const raw = (typeof alt === 'string' ? alt : alt?.transcript || '').trim();
    if (!raw) continue;

    const repaired = repairTurkishDentalPhonetics(raw);
    const ascii = normalizeAsciiTr(repaired);
    const teeth = extractAllFdiTeethInOrder(repaired);
    const surfaces = extractDentalSurfaces(repaired);

    let score = 0;
    // Her geçerli FDI diş numarası yüksek puan kazandırır
    score += teeth.length * 25;
    // Yüzey eşleşmeleri
    score += surfaces.length * 12;

    // Katalog işlem adı eşleşmesi
    for (const p of normProcs) {
      if (p && ascii.includes(p)) {
        score += 30;
      }
    }

    // Malzeme adı eşleşmesi
    for (const m of normMats) {
      if (m && ascii.includes(m)) {
        score += 20;
      }
    }

    // Temel dental anahtar kelimeler
    for (const kw of dentalCoreKeywords) {
      if (ascii.includes(kw)) {
        score += 10;
      }
    }

    // Confidence ve sıra önceliği (eşitlik bozucu)
    const confidence =
      typeof alt === 'object' && alt !== null && typeof alt.confidence === 'number' && alt.confidence > 0
        ? alt.confidence
        : 0.5;
    score += confidence * 5 - i * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestTranscript = repaired;
    }
  }

  const firstRaw = typeof alternatives[0] === 'string' ? alternatives[0] : alternatives[0]?.transcript || '';
  return bestTranscript || repairTurkishDentalPhonetics(firstRaw);
}

/**
 * Metindeki diş yüzeylerini ("Mezial, Okluzal, Distal" -> ["M", "O", "D"], "MOD" -> ["M", "O", "D"] vb.) çıkarır.
 */
export function extractDentalSurfaces(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  // Önce "Yüzeyler ..." veya "Yüzey: ..." bölümü varsa onu, yoksa tüm metni tara
  const repaired = repairTurkishDentalPhonetics(text);
  const surfaces: string[] = [];
  const addSurface = (code: 'M' | 'O' | 'D' | 'B' | 'L') => {
    if (!surfaces.includes(code)) {
      surfaces.push(code);
    }
  };

  // Birleşik ve tekil yüzey tokenlarını metindeki geçiş sırasına göre yakala
  const tokenRegex =
    /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])(mezyo[\s\-]*okl[uü]zo[\s\-]*distal|mezyo[\s\-]*okl[uü]zal|disto[\s\-]*okl[uü]zal|MODBL|MODB|MODL|MOB|MOL|DOB|DOL|MOD|MO|DO|OD|OM|MD|mezial|mezyal|mezar|mesai|ön\s+arayüz|oklüzal|okluzal|okul|çiğneme|distal|dijital|destan|arka\s+arayüz|bukkal|bukal|bakkal|vestibüler|vestibuler|yanak|dudak|lingual|palatinal|dil|damak)(?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(repaired)) !== null) {
    const rawToken = match[1];
    const upper = rawToken.toUpperCase();
    const lower = normalizeAsciiTr(rawToken);

    if (/^[MODBL]{2,5}$/.test(upper)) {
      for (const ch of upper) {
        if (ch === 'M' || ch === 'O' || ch === 'D' || ch === 'B' || ch === 'L') {
          addSurface(ch);
        }
      }
      continue;
    }

    if (lower.includes('mezyo') && lower.includes('okl') && lower.includes('distal')) {
      addSurface('M');
      addSurface('O');
      addSurface('D');
    } else if (lower.includes('mezyo') && lower.includes('okl')) {
      addSurface('M');
      addSurface('O');
    } else if (lower.includes('disto') && lower.includes('okl')) {
      addSurface('D');
      addSurface('O');
    } else if (lower.startsWith('mez') || lower.startsWith('mesai') || lower.includes('on arayuz')) {
      addSurface('M');
    } else if (lower.startsWith('okl') || lower === 'okul' || lower.includes('cigneme')) {
      addSurface('O');
    } else if (lower.startsWith('dist') || lower === 'dijital' || lower === 'destan' || lower.includes('arka arayuz')) {
      addSurface('D');
    } else if (
      lower.startsWith('buk') ||
      lower === 'bakkal' ||
      lower.startsWith('vest') ||
      lower === 'yanak' ||
      lower === 'dudak'
    ) {
      addSurface('B');
    } else if (lower.startsWith('ling') || lower.startsWith('palat') || lower === 'dil' || lower === 'damak') {
      addSurface('L');
    }
  }

  // Eğer "Yüzeyler: M, O, D" gibi tek harfli yüzey kodu yazıldıysa:
  const surfaceClauseMatch = repaired.match(/yüzey(?:ler|i)?\s*:?\s*([^.;]+?)(?=(?:,?\s*(?:tedavi|endikasyon|malzeme|bölüm)\b|$))/i);
  if (surfaceClauseMatch) {
    const singleLetters = surfaceClauseMatch[1].match(/(?<![a-zA-ZçğıöşüÇĞİÖŞÜ])[MODBL](?![a-zA-ZçğıöşüÇĞİÖŞÜ])/gi);
    if (singleLetters) {
      for (const letter of singleLetters) {
        const up = letter.toUpperCase() as 'M' | 'O' | 'D' | 'B' | 'L';
        addSurface(up);
      }
    }
  }

  return surfaces;
}

/**
 * Metindeki anatomik diş bölümünü (crown / cervical / root) çıkarır.
 */
export function extractAnatomicalSection(text: string): 'crown' | 'cervical' | 'root' | null {
  if (!text || typeof text !== 'string') return null;
  const ascii = normalizeAsciiTr(text);
  if (/(?<![a-z])(kole|servikal|boyun|dis boynu|sement)(?![a-z])/.test(ascii)) {
    return 'cervical';
  }
  if (/(?<![a-z])(kok|kok ucu|apeks|apikal)(?![a-z])/.test(ascii) && !ascii.includes('apikal lezyon')) {
    return 'root';
  }
  if (/(?<![a-z])(kuron|kron|tac)(?![a-z])/.test(ascii)) {
    return 'crown';
  }
  return null;
}

const GENERIC_PROCEDURE_WORDS = new Set([
  'kompozit',
  'dolgu',
  'kanal',
  'tedavi',
  'tedavisi',
  'dis',
  'cekimi',
  'cekim',
  'implant',
  'yerli',
  'zirkonyum',
  'kuron',
  'kron',
  'kaplama',
  'tek',
  'yuzey',
  'ekle',
  'sil',
  'malzeme',
  'malzemesi',
  'malzemeler',
]);

/**
 * Kullanıcının söylediği metinde stok/malzeme (inventory) listesindeki malzemeleri bulur ve döndürür.
 */
export function matchSpokenMaterials(
  text: string,
  inventory: InventoryMaterialItem[] = []
): MatchedVoiceMaterial[] {
  if (!text || typeof text !== 'string' || !Array.isArray(inventory) || inventory.length === 0) {
    return [];
  }

  const repaired = repairTurkishDentalPhonetics(text);
  const fullAscii = normalizeAsciiTr(repaired);

  // "malzeme: ..." veya "malzemeler ..." bölümü varsa ayrıca ayıkla
  const explicitMatMatch = repaired.match(
    /malzeme(?:ler|si)?\s*:?\s*([^,.;]+(?:\s*,\s*[^,.;]+)*?)(?=(?:\s+(?:ekle|sil|kaldır|tedavi|endikasyon|yüzey)\b|$))/i
  );
  const explicitClauseAscii = explicitMatMatch ? normalizeAsciiTr(explicitMatMatch[1]) : '';

  const matched: MatchedVoiceMaterial[] = [];
  const seenIds = new Set<string>();

  for (const item of inventory) {
    if (!item || !item.name) continue;
    const itemNameAscii = normalizeAsciiTr(item.name).trim();
    if (!itemNameAscii) continue;

    let isMatch = false;

    // 1. Tam malzeme adı cümlede geçiyorsa
    if (fullAscii.includes(itemNameAscii)) {
      isMatch = true;
    }

    // 2. "malzeme: ..." bloğu içinde malzeme adının anlamlı bir parçası geçiyorsa
    const tokens = itemNameAscii.split(/[\s\-_/(),]+/).filter((t) => t.length >= 2);
    if (!isMatch && explicitClauseAscii) {
      if (
        explicitClauseAscii.includes(itemNameAscii) ||
        itemNameAscii.includes(explicitClauseAscii.trim()) ||
        tokens.some((tok) => tok.length >= 3 && explicitClauseAscii.includes(tok))
      ) {
        isMatch = true;
      }
    }

    // 3. Genel cümlede ayırt edici (jenerik işlem kelimesi olmayan) malzeme/marka tokenı geçiyorsa
    if (!isMatch && tokens.length > 0) {
      const distinctiveTokens = tokens.filter((t) => t.length >= 3 && !GENERIC_PROCEDURE_WORDS.has(t));
      if (
        distinctiveTokens.length > 0 &&
        distinctiveTokens.some((tok) => {
          const r = new RegExp(`(?<![a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
          return r.test(fullAscii);
        })
      ) {
        isMatch = true;
      }
    }

    if (isMatch) {
      const resolvedId = String(item.id || item.inventoryItemId || item.name);
      if (!seenIds.has(resolvedId)) {
        seenIds.add(resolvedId);
        const unitCost = Number(item.costPerUnit ?? item.unitCost ?? 0);
        const unitSalePriceMinor = Number(item.unitSalePriceMinor ?? 0);
        matched.push({
          id: resolvedId,
          inventoryItemId: resolvedId,
          name: item.name,
          quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
          costPerUnit: unitCost,
          unitCost,
          unitSalePriceMinor,
        });
      }
    }
  }

  return matched;
}

/**
 * Söylenen işlem ifadesini katalogdaki tam işlem adıyla ("Kompozit Dolgu (Tek Yüzey)", "Zirkonyum Kuron" vb.) eşleştirir.
 */
export function matchDentalProcedureName(
  spokenText: string,
  procNames: string[] = DEFAULT_DENTAL_PROCEDURES
): string | null {
  if (!spokenText || typeof spokenText !== 'string') return null;
  const effectiveProcs = Array.isArray(procNames) && procNames.length > 0 ? procNames : DEFAULT_DENTAL_PROCEDURES;
  const repaired = repairTurkishDentalPhonetics(spokenText);
  const ascii = normalizeAsciiTr(repaired);

  // 1. Doğrudan tam ad veya parantez içi hariç baz ad eşleşmesi (en uzun eşleşmeye öncelik ver)
  const candidates: Array<{ name: string; score: number }> = [];

  for (const proc of effectiveProcs) {
    const procAscii = normalizeAsciiTr(proc).trim();
    const baseAscii = normalizeAsciiTr(proc.replace(/\(.*?\)/g, '')).trim();
    if (!procAscii) continue;

    if (ascii === procAscii || ascii === baseAscii) {
      candidates.push({ name: proc, score: 100 + proc.length });
      continue;
    }
    if (procAscii && ascii.includes(procAscii)) {
      candidates.push({ name: proc, score: 90 + procAscii.length });
      continue;
    }
    if (baseAscii && baseAscii.length >= 3 && ascii.includes(baseAscii)) {
      candidates.push({ name: proc, score: 80 + baseAscii.length });
      continue;
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].name;
  }

  // 2. Anahtar kelime tabanlı eşleştirme (zirkonyum, kompozit/dolgu, kanal, çekim, implant, detertraj)
  const findInCatalog = (keywords: string[], fallbackName: string): string => {
    for (const proc of effectiveProcs) {
      const pAscii = normalizeAsciiTr(proc);
      if (keywords.some((kw) => pAscii.includes(kw))) {
        return proc;
      }
    }
    return fallbackName;
  };

  if (/\b(zirkonyum|kaplama|kuron|kron)\b/i.test(ascii)) {
    return findInCatalog(['zirkonyum', 'kuron', 'kron', 'kaplama'], 'Zirkonyum Kuron');
  }
  if (/\b(kompozit|dolgu|amalgam)\b/i.test(ascii)) {
    return findInCatalog(['kompozit dolgu', 'kompozit', 'dolgu'], 'Kompozit Dolgu (Tek Yüzey)');
  }
  if (/\b(kanal|endodonti)\b/i.test(ascii)) {
    return findInCatalog(['kanal tedavisi', 'kanal'], 'Kanal Tedavisi (Tek Kanal)');
  }
  if (/\b(cekim|cekimi|cek)\b/i.test(ascii)) {
    return findInCatalog(['dis cekimi', 'cekim'], 'Diş Çekimi');
  }
  if (/\b(implant)\b/i.test(ascii)) {
    return findInCatalog(['implant'], 'İmplant (Yerli)');
  }
  if (/\b(detertraj|dis tasi|tartir|temizlik)\b/i.test(ascii)) {
    return findInCatalog(['detertraj', 'dis tasi'], 'Detertraj');
  }

  return null;
}

/**
 * Bir tedavi eklendiğinde (intent === 'ADD'), o tedaviye `indicationLinks` üzerinden bağlanmış
 * endikasyonları otomatik olarak çözümler ve varsa açıkça söylenmiş endikasyonlarla birleştirir.
 */
export function resolveAutoLinkedIndications(
  procedureNameOrInput:
    | string
    | null
    | undefined
    | Record<string, any>
    | {
        procedureName?: string | null;
        procedureId?: string | null;
        indication?: string | null;
        indications?: string[];
        indicationLinks?: Record<string, string | string[]>;
      },
  indicationLinksOrProcName?: Record<string, string | string[]> | string | null,
  explicitIndicationsOrProcId?: string | string[] | null,
  procedureIdOrExplicit?: string | string[] | null
): string[] {
  let procName: string | null | undefined;
  let procId: string | null | undefined =
    typeof procedureIdOrExplicit === 'string' ? procedureIdOrExplicit : undefined;
  let links: Record<string, string | string[]> | undefined =
    typeof indicationLinksOrProcName === 'object' && indicationLinksOrProcName !== null
      ? indicationLinksOrProcName
      : undefined;
  let explicit: string | string[] | null | undefined = explicitIndicationsOrProcId;

  if (typeof procedureNameOrInput === 'object' && procedureNameOrInput !== null) {
    // Support legacy caller signature: resolveAutoLinkedIndications(indicationLinks, procName, procId, explicitInds)
    if (typeof indicationLinksOrProcName === 'string' || Array.isArray(procedureIdOrExplicit)) {
      links = procedureNameOrInput as Record<string, string | string[]>;
      procName = typeof indicationLinksOrProcName === 'string' ? indicationLinksOrProcName : null;
      procId = typeof explicitIndicationsOrProcId === 'string' ? explicitIndicationsOrProcId : null;
      explicit = procedureIdOrExplicit ?? null;
    } else {
      procName = procedureNameOrInput.procedureName;
      procId = procedureNameOrInput.procedureId ?? procId;
      links = procedureNameOrInput.indicationLinks ?? links;
      explicit =
        procedureNameOrInput.indications && procedureNameOrInput.indications.length > 0
          ? procedureNameOrInput.indications
          : (procedureNameOrInput.indication ?? explicit);
    }
  } else {
    procName = typeof procedureNameOrInput === 'string' ? procedureNameOrInput : null;
  }

  const combined: string[] = [];
  const seenAscii = new Set<string>();
  const addIndication = (val: string) => {
    const trimmed = (val || '').trim();
    if (!trimmed) return;
    const key = normalizeAsciiTr(trimmed);
    if (!seenAscii.has(key)) {
      seenAscii.add(key);
      combined.push(trimmed);
    }
  };

  // 1. Açıkça belirtilen endikasyonları koru (ör. Madde 5.1 "Endikasyonu: Çürük")
  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      if (typeof item === 'string') {
        item.split(',').forEach(addIndication);
      }
    }
  } else if (typeof explicit === 'string' && explicit.trim()) {
    explicit.split(',').forEach(addIndication);
  }

  if (!links || typeof links !== 'object') {
    return combined;
  }

  const procAscii = normalizeAsciiTr(procName || '').trim();
  const procBaseAscii = normalizeAsciiTr((procName || '').replace(/\(.*?\)/g, '')).trim();
  const procIdTrimmed = (procId || '').trim();

  if (!procAscii && !procIdTrimmed) {
    return combined;
  }

  const matchesProc = (candidate: string): boolean => {
    const cTrim = (candidate || '').trim();
    if (!cTrim) return false;
    if (procIdTrimmed && cTrim === procIdTrimmed) return true;
    const cAscii = normalizeAsciiTr(cTrim);
    const cBaseAscii = normalizeAsciiTr(cTrim.replace(/\(.*?\)/g, '')).trim();
    if (!cAscii) return false;
    if (procAscii && (cAscii === procAscii || cBaseAscii === procBaseAscii)) return true;
    if (procBaseAscii && procBaseAscii.length >= 4 && (cAscii.includes(procBaseAscii) || procBaseAscii.includes(cBaseAscii))) {
      return true;
    }
    return false;
  };

  // 2. indicationLinks içinde hem (İşlem -> Endikasyon[]) hem de (Endikasyon -> İşlem[]) yönünü destekle
  for (const [key, rawVal] of Object.entries(links)) {
    const values = Array.isArray(rawVal)
      ? rawVal.filter((v): v is string => typeof v === 'string')
      : typeof rawVal === 'string'
        ? [rawVal]
        : [];

    if (matchesProc(key)) {
      for (const v of values) {
        if (!matchesProc(v)) {
          addIndication(v);
        }
      }
    } else if (values.some((v) => matchesProc(v))) {
      addIndication(key);
    }
  }

  return combined;
}

function detectVoiceCommandIntent(text: string): VoiceCommandIntent {
  const ascii = normalizeAsciiTr(text);
  if (
    /(?<![a-z])(sil|silinsin|silelim|kaldir|kaldirilsin|cikar|cikart|iptal|temizle|vazgectim)(?![a-z])/.test(
      ascii
    )
  ) {
    return 'DELETE';
  }
  if (
    /(?<![a-z])(duzenle|duzenlensin|degistir|degistirilsin|guncelle|guncellensin|cevir)(?![a-z])/.test(
      ascii
    )
  ) {
    return 'UPDATE';
  }
  return 'ADD';
}

function detectSelectIntent(text: string, teeth: string[], hasProcedureOrDelete: boolean): VoiceSelectIntent {
  const ascii = normalizeAsciiTr(text);
  if (/(secimi temizle|secimleri temizle|secimleri kaldir|secimleri sifirla|secimi birak)/.test(ascii)) {
    return 'CLEAR_SELECTION';
  }
  if (/(tum agiz|tum disler|butun disler|tum agzi sec)/.test(ascii)) {
    return 'SELECT_ALL';
  }
  if (/(tum ust|ust cene|ust ceneyi sec|ust disler)/.test(ascii)) {
    return 'SELECT_MAXILLA';
  }
  if (/(tum alt|alt cene|alt ceneyi sec|alt disler)/.test(ascii)) {
    return 'SELECT_MANDIBLE';
  }
  if (/(1\.?\s*kadran|birinci kadran|sag ust kadran)/.test(ascii)) {
    return 'SELECT_Q1';
  }
  if (/(2\.?\s*kadran|ikinci kadran|sol ust kadran)/.test(ascii)) {
    return 'SELECT_Q2';
  }
  if (/(3\.?\s*kadran|ucuncu kadran|sol alt kadran)/.test(ascii)) {
    return 'SELECT_Q3';
  }
  if (/(4\.?\s*kadran|dorduncu kadran|sag alt kadran)/.test(ascii)) {
    return 'SELECT_Q4';
  }
  if (/(on disler|kesici disler|anterior|onleri sec)/.test(ascii)) {
    return 'SELECT_ANTERIOR';
  }
  if (/(arka disler|azi disleri|posterior|arkalari sec)/.test(ascii)) {
    return 'SELECT_POSTERIOR';
  }
  if (teeth.length > 0 && (hasProcedureOrDelete || /(?<![a-z])(sec|secilsin|isaretle)(?![a-z])/.test(ascii))) {
    return 'SELECT_TEETH';
  }
  return 'NONE';
}

/**
 * Madde 5 & 5.1 Yapılandırılmış ("36, 37 38 Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler Mezial, Okluzal, Distal")
 * ve Doğal ("15 16 17 zirkonyum ekle", "15 16 zirkonyum sil" vb.) dental sesli komut çözümleyici.
 */
export function parseStructuredOrLocalDentalCommand(
  rawText: string,
  optionsOrProcNames?: ParseDentalCommandOptions | string[],
  indNamesArg?: string[],
  inventoryArg?: InventoryMaterialItem[],
  indicationLinksArg?: Record<string, string | string[]>
): ParsedDentalVoiceResult {
  const options: ParseDentalCommandOptions = Array.isArray(optionsOrProcNames)
    ? {
        procNames: optionsOrProcNames,
        indNames: indNamesArg,
        inventory: inventoryArg,
        indicationLinks: indicationLinksArg,
      }
    : optionsOrProcNames || {};

  const procNames =
    Array.isArray(options.procNames) && options.procNames.length > 0
      ? options.procNames
      : DEFAULT_DENTAL_PROCEDURES;
  const indNames =
    Array.isArray(options.indNames) && options.indNames.length > 0
      ? options.indNames
      : DEFAULT_DENTAL_INDICATIONS;

  const effectiveInventory: InventoryMaterialItem[] =
    Array.isArray(options.inventory) && options.inventory.length > 0
      ? options.inventory
      : Array.isArray(options.materialNames)
        ? options.materialNames
            .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
            .map((name, idx) => ({ id: `mat-${idx}`, name: name.trim() }))
        : [];

  const indicationLinks = options.indicationLinks || {};
  const bufferedTeeth = Array.isArray(options.bufferedTeeth) ? options.bufferedTeeth : [];

  const mergedInput =
    bufferedTeeth.length > 0
      ? mergeBufferedTeethWithCommand(bufferedTeeth, rawText || '')
      : repairTurkishDentalPhonetics(rawText || '');

  const normalizedText = repairTurkishDentalPhonetics(mergedInput);
  const asciiText = normalizeAsciiTr(normalizedText);

  const emptyResult: ParsedDentalVoiceResult = {
    globalIntent: 'NONE',
    selectIntent: 'NONE',
    targetTeeth: [],
    treatments: [],
    diseases: [],
    consultations: [],
    toothNumbers: [],
    procedureName: null,
    indication: null,
    indications: [],
    surfaces: [],
    surface: undefined,
    section: null,
    materials: [],
    materialNames: [],
    intent: 'NONE',
    normalizedText,
    isStructured51: false,
    matched: false,
  };

  if (!normalizedText) {
    return emptyResult;
  }

  // Global onay komutu kontrolü
  if (
    /(plani kaydet|tedaviyi kaydet|islemleri kaydet|plani onayla|islemleri onayla)/.test(asciiText) ||
    asciiText === 'kaydet' ||
    asciiText === 'onayla'
  ) {
    return {
      ...emptyResult,
      globalIntent: 'CONFIRM',
      matched: true,
    };
  }

  // 1. Madde 5.1 Yapılandırılmış Şablon Kontrolü ("Endikasyonu: ..., Tedavi: ..., Yüzeyler ...")
  const hasStructuredKeywords =
    /\bendikasyon(?:u|lar|ları)?\s*:?/i.test(normalizedText) &&
    /\b(?:tedavi(?:si)?|işlem(?:i)?)\s*:?/i.test(normalizedText);

  if (hasStructuredKeywords) {
    const markerDefs = [
      { key: 'indication', regex: /\b(?:endikasyon(?:u|lar|ları)?|indikasyon(?:u)?)\s*:?\s*/i },
      { key: 'procedure', regex: /\b(?:tedavi(?:si)?|işlem(?:i)?)\s*:?\s*/i },
      { key: 'surfaces', regex: /\byüzey(?:ler|leri|i)?\s*:?\s*/i },
      { key: 'materials', regex: /\bmalzeme(?:ler|leri|si)?\s*:?\s*/i },
      { key: 'section', regex: /\bbölüm(?:ü|ler)?\s*:?\s*/i },
    ];

    const foundMarkers: Array<{ key: string; start: number; contentStart: number }> = [];
    for (const def of markerDefs) {
      const m = def.regex.exec(normalizedText);
      if (m && typeof m.index === 'number') {
        foundMarkers.push({
          key: def.key,
          start: m.index,
          contentStart: m.index + m[0].length,
        });
      }
    }
    foundMarkers.sort((a, b) => a.start - b.start);

    const clauses: Record<string, string> = {};
    const prefixText = foundMarkers.length > 0 ? normalizedText.slice(0, foundMarkers[0].start) : normalizedText;

    for (let i = 0; i < foundMarkers.length; i++) {
      const cur = foundMarkers[i];
      const next = foundMarkers[i + 1];
      const rawSlice = normalizedText.slice(cur.contentStart, next ? next.start : normalizedText.length);
      clauses[cur.key] = rawSlice.replace(/^[,;:\s]+|[,;.\s]+$/g, '').trim();
    }

    const teethFromPrefix = extractAllFdiTeethInOrder(prefixText);
    const teeth = teethFromPrefix.length > 0 ? teethFromPrefix : extractAllFdiTeethInOrder(normalizedText);

    // Endikasyon eşleştirme (5.1'de açıkça söylenen "Çürük" vb. korunur)
    let spokenIndication: string | null = null;
    if (clauses.indication) {
      const cleanInd = clauses.indication.replace(/\b(?:ekle|sil|kaldır)\b/gi, '').trim();
      if (cleanInd) {
        const exactFromCatalog = indNames.find(
          (i) => normalizeAsciiTr(i) === normalizeAsciiTr(cleanInd)
        );
        spokenIndication =
          exactFromCatalog ||
          cleanInd.charAt(0).toLocaleUpperCase('tr-TR') + cleanInd.slice(1);
      }
    }

    const matchedProc = matchDentalProcedureName(clauses.procedure || normalizedText, procNames);
    const surfaces = extractDentalSurfaces(clauses.surfaces || normalizedText);
    const section = extractAnatomicalSection(clauses.section || normalizedText) || (surfaces.length > 0 ? 'crown' : null);
    const matchedMaterials = matchSpokenMaterials(clauses.materials || normalizedText, effectiveInventory);
    const intent = detectVoiceCommandIntent(normalizedText);

    const finalIndications =
      intent === 'ADD'
        ? resolveAutoLinkedIndications(matchedProc, indicationLinks, spokenIndication)
        : spokenIndication
          ? [spokenIndication]
          : [];

    const primaryIndication =
      spokenIndication || (finalIndications.length > 0 ? finalIndications[0] : null);

    const targetTeeth = teeth.length > 0 ? teeth : ['general'];
    const treatment: ParsedVoiceTreatment = {
      procedureName: matchedProc,
      toothNumbers: targetTeeth,
      indication: primaryIndication,
      indications: finalIndications,
      surfaces,
      surface: surfaces.length > 0 ? surfaces.join('') : undefined,
      section,
      materials: matchedMaterials,
      materialNames: matchedMaterials.map((m) => m.name),
      intent,
    };

    return {
      globalIntent: 'NONE',
      selectIntent: teeth.length > 0 ? 'SELECT_TEETH' : 'NONE',
      targetTeeth: teeth,
      treatments: [treatment],
      diseases: [],
      consultations: [],
      toothNumbers: targetTeeth,
      procedureName: treatment.procedureName,
      indication: treatment.indication,
      indications: treatment.indications,
      surfaces: treatment.surfaces,
      surface: treatment.surface,
      section: treatment.section,
      materials: treatment.materials,
      materialNames: treatment.materialNames,
      intent: treatment.intent,
      normalizedText,
      isStructured51: true,
      matched: true,
    };
  }

  // 2. Doğal / Serbest Sesli Komut Çözümleme (Madde 5: "15 16 17 zirkonyum ekle", "15 16 zirkonyum sil", "36 sil" vb.)
  const teeth = extractAllFdiTeethInOrder(normalizedText);
  const intent = detectVoiceCommandIntent(normalizedText);
  const matchedProc = matchDentalProcedureName(normalizedText, procNames);
  const surfaces = extractDentalSurfaces(normalizedText);
  const section = extractAnatomicalSection(normalizedText) || (surfaces.length > 0 ? 'crown' : null);
  const matchedMaterials = matchSpokenMaterials(normalizedText, effectiveInventory);
  const hasExplicitDelete = intent === 'DELETE';
  const selectIntent = detectSelectIntent(normalizedText, teeth, Boolean(matchedProc || hasExplicitDelete));

  // Sadece seçim komutuysa (ör. "tüm üst çeneyi seç", "seçimleri temizle") ve işlem/silme yoksa
  if (!matchedProc && !hasExplicitDelete && selectIntent !== 'NONE') {
    return {
      ...emptyResult,
      selectIntent,
      targetTeeth: teeth,
      toothNumbers: teeth,
      matched: true,
    };
  }

  // Ortam konuşması / gürültü: ne işlem var, ne de diş + silme komutu var
  if (!matchedProc && !(hasExplicitDelete && teeth.length > 0)) {
    return emptyResult;
  }

  let resolvedTeeth = [...teeth];
  if (resolvedTeeth.length === 0) {
    if (selectIntent === 'SELECT_MAXILLA') {
      resolvedTeeth = ['11', '12', '13', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '26', '27', '28'];
    } else if (selectIntent === 'SELECT_MANDIBLE') {
      resolvedTeeth = ['31', '32', '33', '34', '35', '36', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48'];
    } else {
      resolvedTeeth = ['general'];
    }
  }

  // Madde 5: Serbest sesli komutta endikasyonu dahil etme; line ile bağlandığı için indicationLinks'ten otomatik ekle!
  // (Eğer cümlede açıkça "Endikasyonu: ..." yazıldıysa onu da koru)
  let explicitSpokenIndication: string | null = null;
  const explicitIndMatch = normalizedText.match(
    /\b(?:endikasyon(?:u|lar|ları)?|indikasyon(?:u)?)\s*:\s*([^,.;]+)/i
  );
  if (explicitIndMatch?.[1]) {
    explicitSpokenIndication = explicitIndMatch[1].trim();
  }

  const autoIndications =
    intent === 'ADD'
      ? resolveAutoLinkedIndications(matchedProc, indicationLinks, explicitSpokenIndication)
      : explicitSpokenIndication
        ? [explicitSpokenIndication]
        : [];

  const primaryIndication =
    explicitSpokenIndication || (autoIndications.length > 0 ? autoIndications[0] : null);

  const treatment: ParsedVoiceTreatment = {
    procedureName: matchedProc,
    toothNumbers: resolvedTeeth,
    indication: primaryIndication,
    indications: autoIndications,
    surfaces,
    surface: surfaces.length > 0 ? surfaces.join('') : undefined,
    section,
    materials: matchedMaterials,
    materialNames: matchedMaterials.map((m) => m.name),
    intent,
  };

  return {
    globalIntent: 'NONE',
    selectIntent: teeth.length > 0 ? 'SELECT_TEETH' : selectIntent,
    targetTeeth: teeth,
    treatments: [treatment],
    diseases: [],
    consultations: [],
    toothNumbers: resolvedTeeth,
    procedureName: treatment.procedureName,
    indication: treatment.indication,
    indications: treatment.indications,
    surfaces: treatment.surfaces,
    surface: treatment.surface,
    section: treatment.section,
    materials: treatment.materials,
    materialNames: treatment.materialNames,
    intent: treatment.intent,
    normalizedText,
    isStructured51: false,
    matched: true,
  };
}
