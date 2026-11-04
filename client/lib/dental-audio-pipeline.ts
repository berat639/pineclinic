/**
 * DentalVoicePipeline — 5 Katmanlı Klinik Ses İşleme ve Komut Algılama Mimarisi (Madde 5.2)
 *
 * Katman 1: Mikrofon & Tarayıcı (AEC + AGC + 85Hz Highpass + 5200Hz Frez Notch + 6800Hz Lowpass + DynamicsCompressor)
 * Katman 2: Krisp / Neural BVC (LiveKit Krisp varsa otomatik bağlanır; yoksa Zero-Config Inline AudioWorklet BVC)
 * Katman 3: VAD + 500ms Pre-Roll Dairesel Ses Tamponu (Ring Buffer — cümlenin başındaki "15" gibi ilk diş numaralarının yutulmasını önler)
 * Katman 4: LiveKit Turn & Barge-In Agent (2400ms Diş Numarası Sayma Duraksaması + 180ms Yakın-Alan Gerçek Araya Girme & AbortController)
 * Katman 5: AI İletimi (16kHz Mono PCM WAV Base64 + webkitSpeechRecognition maxAlternatives=5 + Biriktirilen Diş Numaraları)
 */

import { createAudioContext } from './browser-audio-support';
import { evaluateLiveKitTurkishTurn } from './turn-detector';

export type DentalPipelineStage =
  | 'idle'
  | 'listening'
  | 'speech_detected'
  | 'holding_numbers'
  | 'barge_in'
  | 'analyzing';

export type DentalKrispMode = 'livekit-krisp' | 'worklet-bvc' | 'fallback-analyser';

export interface DentalCommandReadyPayload {
  /** Birleştirilmiş, normalize edilmiş nihai dental komut metni (örn. "15 16 17 zirkonyum ekle") */
  text: string;
  /** webkitSpeechRecognition maxAlternatives=5 üzerinden toplanan normalize alternatif metin adayları */
  alternatives: string[];
  /** Utterance boyunca (veya duraksamalı sayma sırasında) yakalanan benzersiz FDI diş numaraları ("15", "16", "17" vb.) */
  bufferedTeeth: string[];
  /** 500ms Pre-Roll Ring Buffer dahil 16kHz Mono PCM WAV ses verisi (Base64) */
  audioBase64: string | null;
  /** Ses MIME tipi ('audio/wav') */
  audioMimeType: 'audio/wav';
  /** Komut hazır olduğundaki pipeline aşaması */
  stage: DentalPipelineStage;
  /** Komutun tetiklenme nedeni */
  triggerReason?: 'action_keyword' | 'procedure_silence' | 'enumeration_complete' | 'turn_eou';
  /** Ses istatistikleri (SNR, tepe enerji, Krisp/BVC modu, süre) */
  audioStats?: {
    durationMs: number;
    peakRms: number;
    noiseFloorRms: number;
    snrDb: number;
    krispMode: DentalKrispMode;
    preRollIncludedMs: number;
  };
}

export interface DentalStageMeta {
  stage: DentalPipelineStage;
  bufferedTeeth: string[];
  transcript?: string;
  krispMode: DentalKrispMode;
  reasonTr?: string;
}

export interface DentalBargeInEvent {
  durationMs: number;
  rms: number;
  noiseFloorRms: number;
  snrDb: number;
  abortedActiveRequest: boolean;
  timestamp: number;
}

export interface DentalAudioLevelMeta {
  level: number;
  rawLevel: number;
  rms: number;
  noiseFloor: number;
  snrDb: number;
  speechBandRatio: number;
  zcr: number;
  isNearFieldSpeech: boolean;
  suppressed: boolean;
  krispMode: DentalKrispMode;
}

export interface DentalVoicePipelineOptions {
  /** Utterance tamamlandığında AI katmanına iletilecek komut + 16kHz WAV ses + alternatifler + diş listesi */
  onCommandReady: (payload: DentalCommandReadyPayload) => void | Promise<void>;
  /** Pipeline aşaması değiştiğinde çağrılır */
  onStageChange?: (stage: DentalPipelineStage, meta: DentalStageMeta) => void;
  /** Canlı transkript veya biriktirilen diş numaraları güncellendiğinde çağrılır */
  onTranscriptChange?: (
    transcript: string,
    meta: { isFinal: boolean; bufferedTeeth: string[]; stage: DentalPipelineStage }
  ) => void;
  /** AI analiz yaparken hekim yakın alanda konuşarak araya girdiğinde (Barge-In >= 180ms) çağrılır */
  onBargeIn?: (event: DentalBargeInEvent) => void;
  /** Hekim "asistanı kapat" / "dinlemeyi kapat" dediğinde çağrılır */
  onCloseCommand?: (rawText: string) => void;
  /** Gerçek zamanlı ses seviyesi ve VAD/BVC telemetrisi */
  onLevelChange?: (level: number, meta: DentalAudioLevelMeta) => void;
  /** Hata durumunda çağrılır */
  onError?: (error: { code: string; message: string; fatal: boolean }) => void;
  /** Diş numarası sayma duraksaması bekleme süresi (varsayılan: 2400 ms) */
  enumerationHoldMs?: number;
  /** İşlem adı söylenip eylem kelimesi ("ekle") söylenmediğinde beklenecek sessizlik süresi (varsayılan: 1350 ms) */
  procedureSilenceMs?: number;
  /** Konuşma başlangıcı öncesi dairesel tampon (Pre-Roll Ring Buffer) süresi (varsayılan: 500 ms) */
  preRollMs?: number;
  /** Barge-In (gerçek araya girme) için gereken kesintisiz yakın-alan konuşma süresi (varsayılan: 180 ms) */
  bargeInMinSpeechMs?: number;
  /** STT maksimum alternatif sayısı (varsayılan: 5) */
  maxAlternatives?: number;
  /** Klinik prosedür/işlem isimleri (dinamik katalog terimleri) */
  procedureNames?: string[];
  /** Klinik endikasyon isimleri (dinamik katalog terimleri) */
  indicationNames?: string[];
  /** Dil kodu (varsayılan: 'tr-TR') */
  lang?: string;
}

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 16 kHz'de 20 ms

/** Geçerli FDI diş numaraları kümesi (11-18, 21-28, 31-38, 41-48) */
export const VALID_FDI_TEETH = new Set<string>([
  '11', '12', '13', '14', '15', '16', '17', '18',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '31', '32', '33', '34', '35', '36', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48',
]);

/** Kapatma/Durdurma eylemleri */
export const CLOSE_PATTERNS = [
  'asistanı kapat', 'asistani kapat', 'asistan kapat',
  'asistanı durdur', 'asistani durdur', 'asistan durdur',
  'dinlemeyi kapat', 'dinleme kapat', 'dinlemeyi durdur', 'dinleme durdur', 'dinlemeyi bitir', 'dinleme bitir',
  'mikrofonu kapat', 'mikrofon kapat', 'mikrofonu durdur', 'mikrofon durdur',
  'sesi kapat', 'ses kapat', 'kapat asistanı', 'kapat asistan', 'kapat dinlemeyi', 'dinleme dur',
  'asistanı sonlandır', 'dinlemeyi sonlandır',
];

/** Doğrudan dental komut eylemleri */
export const ACTION_KEYWORDS = [
  'ekle', 'eklensin', 'ekleyelim', 'ekler misin', 'uygula', 'uygulansın',
  'sil', 'silinsin', 'silelim', 'kaldır', 'kaldırılsın', 'çıkar', 'çıkart', 'iptal et',
  'seçimi temizle', 'seçimleri temizle', 'seçimleri kaldır',
  'düzenle', 'düzenlensin', 'güncelle', 'güncellensin', 'değiştir', 'değiştirilsin',
  'seç', 'seçilsin', 'işaretle',
  'planı kaydet', 'tedaviyi kaydet', 'işlemleri kaydet', 'planı onayla', 'işlemleri onayla', 'kaydet', 'onayla',
];

/** Dental domain sözlüğü: ortam konuşmasını gerçek dental komuttan ayırmak için kullanılır */
export const DENTAL_DOMAIN_TERMS = [
  'dolgu', 'kompozit', 'amalgam', 'kanal', 'endodonti', 'çekim', 'çek', 'implant', 'zirkonyum',
  'kuron', 'kron', 'kaplama', 'köprü', 'protez', 'detertraj', 'tartır', 'diş taşı', 'temizlik', 'temizliği',
  'inley', 'onlay', 'overlay', 'veneer', 'lamina', 'porselen', 'beyazlatma', 'bleaching', 'rezeksiyon',
  'apeksifikasyon', 'kistektomi', 'alveoloplasti', 'gingival', 'periodontoloji', 'ortodonti', 'flor',
  'oklüzal', 'mezyal', 'distal', 'bukkal', 'vestibüler', 'lingual', 'palatinal', 'mod', 'kole', 'servikal', 'kök',
  'çürük', 'kırık', 'lezyon', 'apikal', 'pulpitis', 'abse', 'enfeksiyon', 'eksik diş', 'estetik',
  'üst çene', 'alt çene', 'tüm ağız', 'tüm dişler', 'bütün dişler', 'maksilla', 'mandibula',
  'kadran', 'anterior', 'posterior', 'ön dişler', 'arka dişler', 'azı dişleri', 'kesici dişler',
  'seçimi temizle', 'seçimleri temizle', 'seçimleri kaldır', 'seçimleri sıfırla',
  'diyabet', 'hipertansiyon', 'astım', 'alerji', 'konsültasyon', 'kardiyoloji',
  'planı kaydet', 'tedaviyi kaydet', 'işlemleri kaydet', 'planı onayla', 'işlemleri onayla',
];

/**
 * Türkçe yazıyla söylenen diş numaralarını ("on beş" -> "15", "on altı" -> "16"),
 * STT'nin ayrı yazdığı onlar+birler rakamlarını ("10 5" -> "15"),
 * Türkçe çekim eki almış diş numaralarını ("15'e" -> "15", "16'ya" -> "16"),
 * bitişik FDI sayılarını ("1516 17" -> "15 16 17") ve
 * ilk hecesi yutulmuş ardışık diş serilerini ("5 16 17" -> "15 16 17") normalize eder.
 */
export function normalizeDentalCommandNumbers(rawText: string): string {
  if (!rawText) return '';
  let text = rawText;

  const tensMap: Record<string, number> = {
    on: 10,
    yirmi: 20,
    otuz: 30,
    kırk: 40,
    kirk: 40,
  };
  const onesMap: Record<string, number> = {
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

  // 1. Türkçe yazıyla "on beş", "onbeş", "yirmi altı" -> "15", "26"
  // Ayrıca çekim eki almış "on beşe", "on altıya" gibi formları da yakalar
  for (const [tenWord, tenVal] of Object.entries(tensMap)) {
    for (const [oneWord, oneVal] of Object.entries(onesMap)) {
      const fdi = String(tenVal + oneVal);
      const pattern = new RegExp(
        `(?<=^|[\\s,.;:!?()\\-])${tenWord}\\s*${oneWord}(?:['’\`´]?(?:e|a|ye|ya|i|ı|u|ü|de|da|te|ta|den|dan|ten|tan))?(?=$|[\\s,.;:!?()\\-])`,
        'gi'
      );
      text = text.replace(pattern, fdi);
    }
  }

  // 2. STT'nin "10 5", "20 6", "10 beş", "on 5" şeklinde yarı rakam yarı yazı döndürdüğü FDI kombinasyonları
  for (const [tenWord, tenVal] of Object.entries(tensMap)) {
    const tenNumPattern = new RegExp(
      `(?<=^|[\\s,.;:!?()\\-])(?:${tenWord}|${tenVal})\\s+([1-8])(?=$|[\\s,.;:!?()\\-])`,
      'gi'
    );
    text = text.replace(tenNumPattern, (_m, oneDigit: string) => String(tenVal + Number(oneDigit)));

    for (const [oneWord, oneVal] of Object.entries(onesMap)) {
      const numWordPattern = new RegExp(
        `(?<=^|[\\s,.;:!?()\\-])${tenVal}\\s+${oneWord}(?=$|[\\s,.;:!?()\\-])`,
        'gi'
      );
      text = text.replace(numWordPattern, String(tenVal + oneVal));
    }
  }

  // 3. FDI diş numarasına yapışık Türkçe hâl eklerini temizle ("15'e" -> "15", "16'ya" -> "16", "17de" -> "17")
  text = text.replace(
    /\b([1-4][1-8])['’`´-]?(?:e|a|ye|ya|i|ı|u|ü|yi|yı|yu|yü|de|da|te|ta|den|dan|ten|tan|in|ın|un|ün|nin|nın|nun|nün|le|la|yle|yla|deki|daki)\b/gi,
    '$1'
  );

  // 4. Ardışık FDI diş numarasından hemen önce tek başına yazıyla kalmış rakam ("beş 16 17" -> "5 16 17")
  for (const [oneWord, oneVal] of Object.entries(onesMap)) {
    const singleBeforeFdi = new RegExp(
      `(?<=^|[\\s,.;:!?()\\-])${oneWord}(?=\\s+[1-4][1-8](?=$|[\\s,.;:!?()\\-]))`,
      'gi'
    );
    text = text.replace(singleBeforeFdi, String(oneVal));
  }

  // 5. Bitişik yazılmış FDI diş numaralarını ayır ("1516 17" -> "15 16 17", "151617" -> "15 16 17")
  text = text.replace(/\b((?:[1-4][1-8]){2,8})\b/g, (match) => {
    const pairs: string[] = [];
    for (let i = 0; i < match.length; i += 2) {
      pairs.push(match.slice(i, i + 2));
    }
    return pairs.join(' ');
  });

  // 6. Başlangıçta onlar basamağı yutulmuş ardışık diş serisini tamamla ("5 16 17" -> "15 16 17", "6 17 18" -> "16 17 18")
  text = text.replace(
    /\b([1-8])\s+(([1-4])([1-8]))\b/g,
    (full, firstDigitStr: string, secondFdi: string, quadrantStr: string, secondUnitStr: string) => {
      const firstDigit = Number(firstDigitStr);
      const secondUnit = Number(secondUnitStr);
      if (Math.abs(firstDigit - secondUnit) === 1) {
        return `${quadrantStr}${firstDigit} ${secondFdi}`;
      }
      return full;
    }
  );

  // 7. İlk FDI dişten sonra birler basamağı olarak devam eden ardışık seriyi tamamla ("15 6 7" -> "15 16 17")
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(
      /\b(([1-4])([1-8]))\s+([1-8])\b(?!\s*(?:tl|lira|₺|bin|yüz|kanal|yüzey))/gi,
      (full, firstFdi: string, quadrantStr: string, firstUnitStr: string, nextDigitStr: string) => {
        const firstUnit = Number(firstUnitStr);
        const nextDigit = Number(nextDigitStr);
        if (Math.abs(nextDigit - firstUnit) === 1) {
          return `${firstFdi} ${quadrantStr}${nextDigit}`;
        }
        return full;
      }
    );
  }

  return text.replace(/\s+/g, ' ').trim();
}

/** Ses metnini küçük harfe çevirip noktalama ve kesme işaretlerini temizler */
export function normalizeSpeechText(text: string): string {
  if (!text) return '';
  return normalizeDentalCommandNumbers(
    text
      .toLocaleLowerCase('tr-TR')
      .replace(/['’`´]/g, '')
      .replace(/[-_.,!?:;]/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Metin içerisindeki tüm geçerli FDI diş numaralarını (11-48) sırasını koruyarak çıkarır */
export function extractFdiTeethFromText(text: string): string[] {
  if (!text) return [];
  const norm = normalizeSpeechText(text);
  if (!norm) return [];
  const matches = norm.match(/\b[1-4][1-8]\b/g) || [];
  const result: string[] = [];
  for (const m of matches) {
    if (VALID_FDI_TEETH.has(m) && result[result.length - 1] !== m) {
      result.push(m);
    }
  }
  return result;
}

/** Bir metin parçasında FDI diş numarası (11-48) olup olmadığını kontrol eder */
export function hasFdiToothNumber(text: string): boolean {
  const norm = normalizeSpeechText(text);
  return /\b[1-4][1-8]\b/.test(norm);
}

/** Bir metin parçasında bilinen işlem, endikasyon, yüzey veya çene/bölge terimi olup olmadığını kontrol eder */
export function hasDentalTerm(
  text: string,
  customProcNames: string[] = [],
  customIndNames: string[] = []
): boolean {
  const norm = normalizeSpeechText(text);
  if (!norm) return false;
  if (DENTAL_DOMAIN_TERMS.some((term) => norm.includes(term))) return true;
  for (const p of customProcNames) {
    const np = normalizeSpeechText(p);
    if (np && norm.includes(np)) return true;
  }
  for (const ind of customIndNames) {
    const ni = normalizeSpeechText(ind);
    if (ni && norm.includes(ni)) return true;
  }
  return false;
}

/** Kapatma/durdurma tetikleyicisi kontrolü */
export function checkCloseTrigger(text: string): boolean {
  if (!text) return false;
  const norm = normalizeSpeechText(text);
  if (!norm) return false;
  if (norm === 'kapat' || norm === 'durdur') return true;
  if (CLOSE_PATTERNS.some((p) => norm.includes(p))) return true;
  const hasSubject = /(?:^|\s)(asistan|asistanı|asistani|dinleme|dinlemeyi|mikrofon|mikrofonu|ses|sesi)(?=$|\s)/i.test(norm);
  const hasCloseVerb = /(?:^|\s)(kapat|kapatılsın|durdur|durdurulsun|bitir|bitirilsin|sonlandır)(?=$|\s)/i.test(norm);
  return Boolean(hasSubject && hasCloseVerb);
}

/** Segmentin dental bir komut parçası olup olmadığını belirler */
export function hasDentalDomainSignal(
  text: string,
  customProcNames: string[] = [],
  customIndNames: string[] = []
): boolean {
  if (!text) return false;
  const norm = normalizeSpeechText(text);
  if (!norm) return false;
  if (checkCloseTrigger(norm)) return true;
  if (hasFdiToothNumber(norm) || hasDentalTerm(norm, customProcNames, customIndNames)) return true;
  if (norm === 'kaydet' || norm === 'onayla') return true;
  return false;
}

/** Yalnızca geçerli bir dental varlık + açık komut eylemi varsa tetikleyici döndürür */
export function checkActionTrigger(
  text: string,
  customProcNames: string[] = [],
  customIndNames: string[] = []
): string | null {
  if (!text) return null;
  const norm = normalizeSpeechText(text);
  if (!norm) return null;

  if (
    /(?:^|\s)(planı kaydet|tedaviyi kaydet|işlemleri kaydet|planı onayla|işlemleri onayla|seçimi temizle|seçimleri temizle|seçimleri kaldır)(?=$|\s)/i.test(norm) ||
    ((norm === 'kaydet' || norm === 'onayla') && norm.split(' ').length <= 2)
  ) {
    return 'kaydet';
  }

  if (!hasFdiToothNumber(norm) && !hasDentalTerm(norm, customProcNames, customIndNames)) {
    return null;
  }

  for (const kw of ACTION_KEYWORDS) {
    const regex = new RegExp(`(^|\\s)${kw}($|\\s)`, 'i');
    if (regex.test(norm)) {
      return kw;
    }
  }

  if (
    hasFdiToothNumber(norm) &&
    hasDentalTerm(norm, customProcNames, customIndNames) &&
    /(?:^|\s)(yap|yapılsın|yaz|yazılsın)(?=$|\s)/i.test(norm)
  ) {
    return 'ekle';
  }

  return null;
}

/**
 * Cümle başında hasta-hekim sohbeti varsa ("ağzınızı açın bakalım 15 16 17 zirkonyum ekle"),
 * ilk dental çapa kelimesinden öncesini kırpar.
 */
export function extractDentalCommandClause(
  text: string,
  customProcNames: string[] = [],
  customIndNames: string[] = []
): string {
  const normalized = normalizeDentalCommandNumbers(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return normalized;

  const anchorPrefixes = new Set([
    'tüm', 'tum', 'bütün', 'butun', 'üst', 'ust', 'alt', 'sağ', 'sag', 'sol',
    'birinci', 'ikinci', 'üçüncü', 'ucuncu', 'dördüncü', 'dorduncu', '1', '2', '3', '4',
    'ön', 'on', 'arka', 'diş', 'dis', 'seçimi', 'secimi', 'seçimleri', 'secimleri',
    'planı', 'plani', 'tedaviyi', 'işlemleri', 'islemleri', 'asistan', 'asistanı', 'dinlemeyi', 'mikrofonu',
  ]);

  for (let i = 0; i < words.length; i++) {
    const cleanW = words[i].toLocaleLowerCase('tr-TR').replace(/['’`´.,!?:;-]/g, '');
    if (/^[1-4][1-8]$/.test(cleanW)) {
      let startIdx = i;
      while (startIdx > 0) {
        const prevW = words[startIdx - 1].toLocaleLowerCase('tr-TR').replace(/['’`´.,!?:;-]/g, '');
        if (anchorPrefixes.has(prevW) || /^[1-4][1-8]$/.test(prevW) || prevW === 've' || prevW === 'ile') {
          startIdx--;
        } else {
          break;
        }
      }
      return words.slice(startIdx).join(' ');
    }
    if (anchorPrefixes.has(cleanW) || hasDentalTerm(cleanW, customProcNames, customIndNames)) {
      return words.slice(i).join(' ');
    }
  }

  return normalized;
}

/**
 * Söylenen metnin henüz YALNIZCA diş numaraları sayımı (örn. "15", "15 16", "15 ve 16 numaralı dişler")
 * olup olmadığını belirler. Henüz tedavi/işlem adı veya eylem fiili söylenmemişse true döner.
 */
export function isOnlyToothEnumeration(
  text: string,
  customProcNames: string[] = [],
  customIndNames: string[] = []
): boolean {
  if (!text) return false;
  const norm = normalizeSpeechText(text);
  if (!norm) return false;

  const teeth = extractFdiTeethFromText(norm);
  if (teeth.length === 0) return false;

  // Eğer açık bir eylem kelimesi ("ekle", "sil", "seç" vb.) veya işlem/endikasyon terimi varsa artık sadece sayı değildir
  if (checkActionTrigger(norm, customProcNames, customIndNames)) return false;
  if (hasDentalTerm(norm, customProcNames, customIndNames)) return false;

  // İzin verilen bağlaç/dolgu kelimeleri dışında anlamlı bir işlem kelimesi var mı kontrol et
  const allowedFillerWords = new Set([
    've', 'ile', 'ya', 'da', 'veya', 'numara', 'numaralı', 'numarali', 'nolu', 'diş', 'dis',
    'dişler', 'disler', 'dişe', 'dise', 'dişlere', 'dislere', 'sağ', 'sag', 'sol', 'üst', 'ust', 'alt',
  ]);

  const tokens = norm.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (VALID_FDI_TEETH.has(token)) continue;
    if (allowedFillerWords.has(token)) continue;
    // Bilinmeyen/uzun bir kelime varsa (örn. katalogda olmayan yeni bir işlem adı) yine de sayı sayımı değil
    if (token.length >= 4) return false;
  }

  return true;
}

/**
 * Biriktirilen diş numaraları (`bufferedTeeth`) ile son gelen komut metnini (`commandText`)
 * mükerrer diş numarası oluşturmadan birleştirir.
 * Örn: bufferedTeeth=['15','16','17'], commandText='zirkonyum ekle' -> '15 16 17 zirkonyum ekle'
 * Örn: bufferedTeeth=['15','16','17'], commandText='17 zirkonyum ekle' -> '15 16 17 zirkonyum ekle'
 */
export function combineBufferedTeethWithCommand(bufferedTeeth: string[], commandText: string): string {
  const cleanCommand = normalizeDentalCommandNumbers(commandText).trim();
  if (!bufferedTeeth || bufferedTeeth.length === 0) return cleanCommand;

  const presentTeeth = new Set(extractFdiTeethFromText(cleanCommand));
  const missingPrefixTeeth = bufferedTeeth.filter((t) => VALID_FDI_TEETH.has(t) && !presentTeeth.has(t));

  if (missingPrefixTeeth.length === 0) {
    return cleanCommand;
  }
  if (!cleanCommand) {
    return missingPrefixTeeth.join(' ');
  }
  return `${missingPrefixTeeth.join(' ')} ${cleanCommand}`.replace(/\s+/g, ' ').trim();
}

/**
 * webkitSpeechRecognition'dan gelen `maxAlternatives = 5` alternatiflerini analiz eder.
 * Birincil transkriptte ilk diş numarası ("15" -> "beş" veya "o beş") yutulmuşsa ancak
 * 2.-5. alternatiflerden birinde geçerli FDI diş numarası ("15", "on beş") veya dental terim yakalanmışsa
 * en yüksek dental sinyal skoruna sahip alternatifi ve tüm alternatiflerdeki diş numaralarını kurtarır.
 */
export function mergeAlternativesForDentalCommand(
  rawAlternatives: Array<{ transcript: string; confidence?: number }>,
  customProcNames: string[] = [],
  customIndNames: string[] = []
): { primaryText: string; alternatives: string[]; extractedTeeth: string[] } {
  if (!rawAlternatives || rawAlternatives.length === 0) {
    return { primaryText: '', alternatives: [], extractedTeeth: [] };
  }

  const normalizedList: string[] = [];
  for (const alt of rawAlternatives) {
    const norm = normalizeDentalCommandNumbers(alt?.transcript || '').trim();
    if (norm && !normalizedList.includes(norm)) {
      normalizedList.push(norm);
    }
  }

  if (normalizedList.length === 0) {
    return { primaryText: '', alternatives: [], extractedTeeth: [] };
  }

  // Her alternatifin dental sinyal puanını hesapla
  let bestText = normalizedList[0];
  let bestScore = -1;

  for (let idx = 0; idx < normalizedList.length; idx++) {
    const candidate = normalizedList[idx];
    const teeth = extractFdiTeethFromText(candidate);
    const hasTerm = hasDentalTerm(candidate, customProcNames, customIndNames);
    const hasAction = Boolean(checkActionTrigger(candidate, customProcNames, customIndNames));
    // Birincil alternatife küçük bir öncelik ver, ancak diş numarası veya dental terim yakalayan alternatif öne geçsin
    const score =
      teeth.length * 10 +
      (hasTerm ? 8 : 0) +
      (hasAction ? 6 : 0) +
      (idx === 0 ? 3 : Math.max(0, 2 - idx * 0.4));

    if (score > bestScore) {
      bestScore = score;
      bestText = candidate;
    }
  }

  // Eğer bestText başında tek haneli bir rakam varsa (örn. "5 zirkonyum") ve başka bir alternatifte
  // aynı birler basamağına sahip FDI diş numarası varsa (örn. "15 zirkonyum"), onu kurtar
  const bestTeeth = extractFdiTeethFromText(bestText);
  if (bestTeeth.length === 0) {
    for (let idx = 0; idx < normalizedList.length; idx++) {
      const altTeeth = extractFdiTeethFromText(normalizedList[idx]);
      if (altTeeth.length > 0) {
        bestTeeth.push(...altTeeth);
        break;
      }
    }
  }

  return {
    primaryText: bestText,
    alternatives: normalizedList,
    extractedTeeth: bestTeeth,
  };
}

/**
 * 16kHz Float32 ses örneklerini standart 16-bit Mono PCM WAV (`audio/wav`) Base64 dizgesine dönüştürür.
 */
export function encodeFloat32ToWavBase64(
  samples: Float32Array,
  sampleRate: number = TARGET_SAMPLE_RATE
): string {
  const numSamples = samples.length;
  const dataByteLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF WAVE başlığı (44 byte)
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM alt parça boyutu
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample = 16
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x2000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

/**
 * Katman 3 — 500ms Pre-Roll Dairesel Ses Tamponu (Ring Buffer) ve Utterance WAV Kaydedici.
 * VAD konuşma başlangıcını algılamadan önceki 500ms'lik sesi dairesel tamponda sürekli tutar.
 * Konuşma başladığı anda bu 500ms'lik ön tamponu utterance kaydının en başına ekler;
 * böylece "15" gibi ilk söylenen diş numaralarının ilk hecesi asla kesilmez.
 */
export class PreRollAudioRingBuffer {
  private readonly sampleRate: number;
  private readonly preRollCapacity: number;
  private readonly maxUtteranceSamples: number;
  private readonly ring: Float32Array;
  private writePos = 0;
  private filledSamples = 0;
  private capturing = false;
  private utteranceChunks: Float32Array[] = [];
  private capturedSampleCount = 0;
  private silenceFramesInUtterance = 0;

  constructor(preRollMs = 500, sampleRate = TARGET_SAMPLE_RATE, maxUtteranceSeconds = 22) {
    this.sampleRate = sampleRate;
    this.preRollCapacity = Math.max(320, Math.round((sampleRate * preRollMs) / 1000));
    this.maxUtteranceSamples = sampleRate * maxUtteranceSeconds;
    this.ring = new Float32Array(this.preRollCapacity);
  }

  /** Her 20ms'lik ses çerçevesini dairesel tampona (veya aktif utterance kaydına) yazar */
  pushFrame(frame: Float32Array, isSpeech = false): void {
    const len = frame.length;
    if (len === 0) return;

    // Dairesel pre-roll tamponunu her zaman güncel tut
    for (let i = 0; i < len; i++) {
      this.ring[this.writePos] = frame[i];
      this.writePos = (this.writePos + 1) % this.preRollCapacity;
    }
    if (this.filledSamples < this.preRollCapacity) {
      this.filledSamples = Math.min(this.preRollCapacity, this.filledSamples + len);
    }

    if (this.capturing) {
      if (isSpeech) {
        this.silenceFramesInUtterance = 0;
      } else {
        this.silenceFramesInUtterance++;
      }
      // Diş numarası sayma duraksamalarında (örn. 1.5 sn sessizlik) sadece ilk 360ms'lik doğal kuyruk sessizliğini
      // WAV içine dahil et, uzun boşlukları sıkıştır ki AI'ya giden WAV net ve kompakt olsun.
      if (isSpeech || this.silenceFramesInUtterance <= 18) {
        if (this.capturedSampleCount + len <= this.maxUtteranceSamples) {
          const copy = new Float32Array(len);
          copy.set(frame);
          this.utteranceChunks.push(copy);
          this.capturedSampleCount += len;
        }
      }
    }
  }

  /**
   * VAD konuşma başlangıcını (`SPEECH_START`) algıladığında çağrılır.
   * Dairesel tampondaki son 500ms'lik sesi kronolojik sırayla utterance başına kopyalar.
   */
  startUtteranceCapture(): void {
    if (this.capturing) return;
    this.capturing = true;
    this.silenceFramesInUtterance = 0;
    const preRoll = this.readPreRollSamples();
    this.utteranceChunks = preRoll.length > 0 ? [preRoll] : [];
    this.capturedSampleCount = preRoll.length;
  }

  /** Dairesel tampondaki son 500ms'lik örnekleri kronolojik sırayla döndürür */
  readPreRollSamples(): Float32Array {
    if (this.filledSamples === 0) return new Float32Array(0);
    const out = new Float32Array(this.filledSamples);
    if (this.filledSamples < this.preRollCapacity) {
      out.set(this.ring.subarray(0, this.filledSamples));
    } else {
      const tailLen = this.preRollCapacity - this.writePos;
      out.set(this.ring.subarray(this.writePos, this.preRollCapacity), 0);
      out.set(this.ring.subarray(0, this.writePos), tailLen);
    }
    return out;
  }

  /** Aktif utterance (veya mevcut pre-roll) sesini tek bir Float32Array olarak birleştirir */
  getContiguousSamples(): Float32Array {
    if (this.utteranceChunks.length === 0) {
      return this.readPreRollSamples();
    }
    const total = this.utteranceChunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.utteranceChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  /**
   * Kaydedilen utterance sesini 16kHz Mono WAV Base64 olarak döndürür ve utterance tamponunu sıfırlar
   * (dairesel pre-roll tamponu ise bir sonraki komut için sıcak kalır).
   */
  flushToWavBase64(resetCapture = true): { audioBase64: string | null; durationMs: number } {
    const samples = this.getContiguousSamples();
    if (resetCapture) {
      this.capturing = false;
      this.utteranceChunks = [];
      this.capturedSampleCount = 0;
      this.silenceFramesInUtterance = 0;
    }
    if (samples.length === 0) {
      return { audioBase64: null, durationMs: 0 };
    }
    const durationMs = Math.round((samples.length / this.sampleRate) * 1000);
    return {
      audioBase64: encodeFloat32ToWavBase64(samples, this.sampleRate),
      durationMs,
    };
  }

  /** Utterance kaydını sıfırlar */
  resetUtterance(): void {
    this.capturing = false;
    this.utteranceChunks = [];
    this.capturedSampleCount = 0;
    this.silenceFramesInUtterance = 0;
  }

  get isCapturing(): boolean {
    return this.capturing;
  }
}

/**
 * Katman 2 & 3 — Yerleşik WebAudio AudioWorkletProcessor (Zero-Config Krisp BVC Fallback + 500ms Pre-Roll + VAD)
 * Harici dosya bağımlılığı olmadan Blob URL üzerinden yüklenir.
 */
const DENTAL_KRISP_BVC_WORKLET_CODE = `
const TARGET_RATE = 16000;
const FRAME_SIZE = 320; // 20ms @ 16kHz
const PRE_ROLL_FRAMES = 25; // 25 * 20ms = 500ms Pre-Roll Ring Buffer

class DentalKrispBvcWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0;
    this.frameBuf = new Float32Array(FRAME_SIZE);
    this.outIdx = 0;

    // 1. derece yüksek geçiren (85Hz) ve konuşma bandı (100Hz-3500Hz) durum değişkenleri
    this.hpPrevIn = 0;
    this.hpPrevOut = 0;
    this.lpSpeechPrev = 0;

    // Krisp / BVC (Background Voice Cancellation) durumu
    this.noiseFloor = 0.004;
    this.nearFieldPeak = 0.035;
    this.voicedStreak = 0;
    this.nearFieldStreak = 0;
    this.hangoverFrames = 0;
    this.inSpeech = false;

    // 500ms Pre-Roll Dairesel Tampon (25 adet 320 örneklik çerçeve)
    this.preRollRing = new Array(PRE_ROLL_FRAMES);
    for (let i = 0; i < PRE_ROLL_FRAMES; i++) {
      this.preRollRing[i] = new Float32Array(FRAME_SIZE);
    }
    this.preRollWriteIdx = 0;
    this.preRollFilled = 0;
  }

  pushPreRoll(frame) {
    this.preRollRing[this.preRollWriteIdx].set(frame);
    this.preRollWriteIdx = (this.preRollWriteIdx + 1) % PRE_ROLL_FRAMES;
    if (this.preRollFilled < PRE_ROLL_FRAMES) {
      this.preRollFilled++;
    }
  }

  processFrame(rawFrame) {
    let sumSq = 0;
    let speechBandSq = 0;
    let peak = 0;
    let zc = 0;
    let prev = rawFrame[0] || 0;

    const cleanFrame = new Float32Array(FRAME_SIZE);

    for (let i = 0; i < FRAME_SIZE; i++) {
      const sIn = rawFrame[i];
      // 85 Hz Highpass (klima/uğultu kesici)
      const hp = 0.967 * (this.hpPrevOut + sIn - this.hpPrevIn);
      this.hpPrevIn = sIn;
      this.hpPrevOut = hp;

      // 3500 Hz Lowpass konuşma formant bandı tahmini
      this.lpSpeechPrev = this.lpSpeechPrev + 0.58 * (hp - this.lpSpeechPrev);
      const speechSample = this.lpSpeechPrev;

      const clamped = Math.max(-1, Math.min(1, hp));
      cleanFrame[i] = clamped;

      const abs = Math.abs(clamped);
      if (abs > peak) peak = abs;
      sumSq += clamped * clamped;
      speechBandSq += speechSample * speechSample;

      if ((clamped >= 0 && prev < 0) || (clamped < 0 && prev >= 0)) {
        zc++;
      }
      prev = clamped;
    }

    const rms = Math.sqrt(sumSq / FRAME_SIZE);
    const speechRms = Math.sqrt(speechBandSq / FRAME_SIZE);
    const speechBandRatio = sumSq > 1e-9 ? Math.min(1, speechBandSq / sumSq) : 0;
    const zcr = zc / FRAME_SIZE;
    const crest = rms > 0.0001 ? peak / rms : 0;

    // Ortam gürültü tabanını (spectral/envelope noise floor) adapte et
    if (rms < this.noiseFloor) {
      this.noiseFloor = this.noiseFloor * 0.91 + rms * 0.09;
    } else if (rms < this.noiseFloor * 1.75 && this.voicedStreak === 0) {
      this.noiseFloor = this.noiseFloor * 0.985 + rms * 0.015;
    }
    this.noiseFloor = Math.max(0.0015, Math.min(0.04, this.noiseFloor));

    const snrLinear = rms / Math.max(0.0005, this.noiseFloor);
    const snrDb = 20 * Math.log10(Math.max(0.1, snrLinear));

    // Darbe, öksürük, hapşırık veya alet tıkırtısı tespiti
    const isImpulseOrCough =
      rms > this.noiseFloor * 2.0 &&
      this.voicedStreak < 3 &&
      (crest > 4.75 || zcr > 0.42);

    // Uzak alan (far-field) arka plan konuşması vs. Hekimin yakın alan (near-field) sesi
    const nearFieldThreshold = Math.max(0.0075, this.noiseFloor * 1.95);
    const isVocalFormant = speechBandRatio >= 0.48 && zcr >= 0.012 && zcr <= 0.39;
    const isFarFieldChatter =
      !isImpulseOrCough &&
      rms > this.noiseFloor * 1.35 &&
      rms < Math.max(nearFieldThreshold, this.nearFieldPeak * 0.24) &&
      this.nearFieldStreak === 0;

    const isNearFieldSpeech =
      !isImpulseOrCough &&
      !isFarFieldChatter &&
      rms >= nearFieldThreshold &&
      isVocalFormant;

    let speechTriggeredNow = false;
    let passSpeech = false;
    let suppressed = false;

    if (isImpulseOrCough || isFarFieldChatter) {
      this.voicedStreak = 0;
      this.nearFieldStreak = 0;
      suppressed = true;
    } else if (isNearFieldSpeech) {
      this.voicedStreak++;
      this.nearFieldStreak++;
      this.hangoverFrames = 15; // 300ms konuşma sonu koruma kuyruğu
      if (rms > this.nearFieldPeak) {
        this.nearFieldPeak = this.nearFieldPeak * 0.8 + rms * 0.2;
      } else {
        this.nearFieldPeak = Math.max(0.025, this.nearFieldPeak * 0.995 + rms * 0.005);
      }
      passSpeech = true;
      if (!this.inSpeech && this.nearFieldStreak >= 1) {
        this.inSpeech = true;
        speechTriggeredNow = true;
      }
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames--;
      this.nearFieldStreak = 0;
      passSpeech = true;
    } else {
      this.voicedStreak = 0;
      this.nearFieldStreak = 0;
      if (this.inSpeech) {
        this.inSpeech = false;
      }
      suppressed = rms > this.noiseFloor * 1.2;
    }

    // BVC Kazanç Yönetimi:
    // - Konuşma başlangıcındaki kısık "15" gibi ilk diş numaralarını yukarı çek (upward AGC)
    // - Uzak alan arka plan konuşmalarını (isFarFieldChatter) ve öksürüğü bastır
    let bvcGain = 1.0;
    if (isImpulseOrCough) {
      bvcGain = 0.06;
    } else if (isFarFieldChatter) {
      bvcGain = 0.14;
    } else if (passSpeech) {
      // Kısık sesli başlangıçları otomatik güçlendir
      bvcGain = rms < 0.035 ? 1.35 : 1.12;
    } else {
      bvcGain = 0.55;
    }

    const outSamples = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      outSamples[i] = Math.max(-1, Math.min(1, cleanFrame[i] * bvcGain));
    }

    this.pushPreRoll(outSamples);

    const rawLevel = Math.min(1, rms * 5.5);
    const level = passSpeech ? Math.min(1, speechRms * 6.5) : 0;

    this.port.postMessage({
      type: speechTriggeredNow ? 'SPEECH_START' : 'FRAME',
      samples: outSamples,
      rms,
      noiseFloor: this.noiseFloor,
      snrDb,
      speechBandRatio,
      zcr,
      level,
      rawLevel,
      isNearFieldSpeech,
      nearFieldStreak: this.nearFieldStreak,
      passSpeech,
      suppressed,
    });
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const data = input[0];
    const n = data.length;

    while (this.pos < n) {
      const idx = Math.floor(this.pos);
      const frac = this.pos - idx;
      const a = data[idx];
      const b = idx + 1 < n ? data[idx + 1] : a;
      let s = a + (b - a) * frac;
      if (this.ratio > 1) {
        const end = Math.min(n, Math.floor(this.pos + this.ratio));
        let acc = 0;
        let count = 0;
        for (let k = idx; k < Math.max(end, idx + 1); k++) {
          acc += data[k];
          count++;
        }
        s = acc / count;
      }
      this.frameBuf[this.outIdx++] = Math.max(-1, Math.min(1, s));
      this.pos += this.ratio;

      if (this.outIdx === FRAME_SIZE) {
        this.processFrame(this.frameBuf);
        this.outIdx = 0;
      }
    }
    this.pos -= n;
    return true;
  }
}

registerProcessor('dental-krisp-bvc-worklet', DentalKrispBvcWorklet);
`;

/**
 * 5 Katmanlı Dental Ses Hattı (DentalVoicePipeline)
 *
 * Mikrofon → Tarayıcı (AEC/AGC/Compressor) → Krisp / AudioWorklet BVC →
 * VAD (500ms Pre-Roll Ring Buffer) → LiveKit Turn & Barge-In Agent → AI
 */
export class DentalVoicePipeline {
  private readonly options: Required<
    Pick<
      DentalVoicePipelineOptions,
      'enumerationHoldMs' | 'procedureSilenceMs' | 'preRollMs' | 'bargeInMinSpeechMs' | 'maxAlternatives' | 'lang'
    >
  > &
    DentalVoicePipelineOptions;

  private stage: DentalPipelineStage = 'idle';
  private krispMode: DentalKrispMode = 'worklet-bvc';
  private running = false;
  private starting = false;
  private hasFatalError = false;
  private analyzing = false;

  // WebAudio & MediaStream referansları
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletBlobUrl: string | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;
  private krispProcessor: any = null;

  // Katman 3: 500ms Pre-Roll Dairesel Ses Tamponu
  private readonly preRollBuffer: PreRollAudioRingBuffer;

  // Katman 4: LiveKit Turn & Barge-In Agent durumları
  private _bufferedTeeth: string[] = [];
  private bufferedTeethUpdatedAt = 0;
  private pendingClauseText = '';
  private lastDispatchedText = '';
  private lastDispatchedAt = 0;
  private latestAlternatives: string[] = [];

  private enumerationHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTriggerTimer: ReturnType<typeof setTimeout> | null = null;
  private procedureSilenceTimer: ReturnType<typeof setTimeout> | null = null;
  private recognitionRestartTimer: ReturnType<typeof setTimeout> | null = null;

  // Barge-In ve telemetri sayaçları
  private activeAbortController: AbortController | null = null;
  private consecutiveNearFieldMs = 0;
  private lastNearFieldSpeechAt = 0;
  private lastBargeInAt = 0;
  private peakUtteranceRms = 0;
  private currentNoiseFloorRms = 0.004;
  private currentSnrDb = 0;

  // Web Speech API (STT) referansları
  private recognition: any = null;
  private processedResultIndex = 0;

  // Dinamik klinik katalog terimleri
  private procedureNames: string[];
  private indicationNames: string[];

  constructor(options: DentalVoicePipelineOptions) {
    this.options = {
      enumerationHoldMs: options.enumerationHoldMs ?? 2400,
      procedureSilenceMs: options.procedureSilenceMs ?? 1350,
      preRollMs: options.preRollMs ?? 500,
      bargeInMinSpeechMs: options.bargeInMinSpeechMs ?? 180,
      maxAlternatives: options.maxAlternatives ?? 5,
      lang: options.lang ?? 'tr-TR',
      ...options,
    };
    this.procedureNames = [...(options.procedureNames || [])];
    this.indicationNames = [...(options.indicationNames || [])];
    this.preRollBuffer = new PreRollAudioRingBuffer(this.options.preRollMs, TARGET_SAMPLE_RATE);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isStarting(): boolean {
    return this.starting;
  }

  get isAnalyzing(): boolean {
    return this.analyzing;
  }

  get currentStage(): DentalPipelineStage {
    return this.stage;
  }

  get currentKrispMode(): DentalKrispMode {
    return this.krispMode;
  }

  get bufferedTeeth(): string[] {
    return [...this._bufferedTeeth];
  }

  /** Klinik işlem ve endikasyon listesini çalışma zamanında günceller */
  updateCatalogTerms(procedureNames: string[], indicationNames: string[] = []): void {
    this.procedureNames = [...procedureNames];
    this.indicationNames = [...indicationNames];
  }

  /** Biriktirilen diş numaralarını sıfırlar */
  clearBufferedTeeth(): void {
    this._bufferedTeeth = [];
    this.bufferedTeethUpdatedAt = 0;
    this.pendingClauseText = '';
  }

  /**
   * AI analizi başladığında çağrılır; aktif analiz için bir `AbortSignal` döndürür.
   * Hekim analiz sırasında mikrofona yakın alanda konuşarak araya girerse (Barge-In >= 180ms),
   * bu `AbortSignal` otomatik olarak iptal edilir (`abort()`).
   */
  beginAnalyzing(): AbortSignal {
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort('superseded');
      } catch {
        // Ignore
      }
    }
    this.activeAbortController = new AbortController();
    this.analyzing = true;
    this.consecutiveNearFieldMs = 0;
    this.setStage('analyzing', 'AI komutu analiz ediyor');
    return this.activeAbortController.signal;
  }

  /** AI analizi tamamlandığında çağrılır ve hattı tekrar dinleme moduna döndürür */
  endAnalyzing(): void {
    this.analyzing = false;
    this.activeAbortController = null;
    this.consecutiveNearFieldMs = 0;
    if (this.running) {
      this.setStage(
        this._bufferedTeeth.length > 0 ? 'holding_numbers' : 'listening',
        'Yeni komut için dinleniyor'
      );
    } else {
      this.setStage('idle', 'Durduruldu');
    }
  }

  /** `beginAnalyzing` / `endAnalyzing` için kolaylaştırıcı sarmalayıcı */
  setAnalyzing(analyzing: boolean): AbortSignal | null {
    if (analyzing) return this.beginAnalyzing();
    this.endAnalyzing();
    return null;
  }

  /**
   * 5 katmanlı ses işleme hattını başlatır.
   */
  async start(): Promise<void> {
    if (this.running || this.starting) return;
    this.starting = true;
    this.hasFatalError = false;

    try {
      if (typeof window === 'undefined') {
        throw new Error('Ses hattı yalnızca tarayıcı ortamında başlatılabilir.');
      }

      if (!window.isSecureContext) {
        this.emitError(
          'insecure-context',
          'Sesli komut güvenli bir bağlantıda çalışır. Localhost veya HTTPS üzerinden yeniden deneyin.',
          true
        );
        return;
      }

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.emitError(
          'unsupported-stt',
          'Tarayıcınız ses tanımayı desteklemiyor. Chrome veya Edge kullanın.',
          true
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        this.emitError(
          'no-media-devices',
          'Tarayıcı mikrofon erişimini desteklemiyor.',
          true
        );
        return;
      }

      // =========================================================================
      // KATMAN 1: Mikrofon & Tarayıcı (Yankı Giderme, Gürültü Bastırma, AGC)
      // =========================================================================
      this.cleanupAudioNodes();
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      this.stream = micStream;

      const audioCtx = createAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      this.audioContext = audioCtx;

      const sourceNode = audioCtx.createMediaStreamSource(micStream);

      // 85Hz Highpass: Klima, masa titreşimi ve nefes patlaması kesici
      const highpassFilter = audioCtx.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 85;
      highpassFilter.Q.value = 0.707;

      // 5200Hz Notch: Dişçi aerotörü / ultrasonik kavitron tiz ıslık bastırıcı
      const drillNotchFilter = audioCtx.createBiquadFilter();
      drillNotchFilter.type = 'notch';
      drillNotchFilter.frequency.value = 5200;
      drillNotchFilter.Q.value = 2.2;

      // 6800Hz Lowpass: Aspiratör tıslaması kesici (Türkçe s/ş/ç/f harflerini korur)
      const lowpassFilter = audioCtx.createBiquadFilter();
      lowpassFilter.type = 'lowpass';
      lowpassFilter.frequency.value = 6800;
      lowpassFilter.Q.value = 0.707;

      // DynamicsCompressor + Makeup Gain: Cümle başındaki kısık "15" gibi diş numaralarını yükseltir
      const compressorNode = audioCtx.createDynamicsCompressor();
      compressorNode.threshold.value = -32;
      compressorNode.knee.value = 24;
      compressorNode.ratio.value = 4;
      compressorNode.attack.value = 0.002;
      compressorNode.release.value = 0.16;

      const makeupGainNode = audioCtx.createGain();
      makeupGainNode.gain.value = 1.45;

      sourceNode.connect(highpassFilter);
      highpassFilter.connect(drillNotchFilter);
      drillNotchFilter.connect(lowpassFilter);
      lowpassFilter.connect(compressorNode);
      compressorNode.connect(makeupGainNode);

      // =========================================================================
      // KATMAN 2 & 3: Krisp / Neural BVC + 500ms Pre-Roll Ring Buffer + VAD
      // =========================================================================
      await this.setupKrispAndWorkletLayer(audioCtx, micStream, makeupGainNode);

      // =========================================================================
      // KATMAN 4 & 5: LiveKit Turn & Barge-In Agent + Çoklu Alternatif STT
      // =========================================================================
      this.setupSpeechRecognition(SpeechRecognition);

      this.running = true;
      this.starting = false;
      this.lastNearFieldSpeechAt = Date.now();
      this.setStage('listening', '5 katmanlı ses hattı aktif ve dinliyor');
    } catch (err: any) {
      this.starting = false;
      this.running = false;
      this.cleanupAudioNodes();
      const code =
        err?.name === 'NotFoundError'
          ? 'audio-capture'
          : err?.name === 'NotAllowedError'
            ? 'not-allowed'
            : 'unknown';
      this.emitError(code, this.getVoiceErrorMessage(code), true);
    }
  }

  /**
   * 5 katmanlı ses işleme hattını tamamen durdurur ve kaynakları serbest bırakır.
   */
  stop(): void {
    this.running = false;
    this.starting = false;
    this.analyzing = false;
    this.clearTimers();

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort('pipeline_stopped');
      } catch {
        // Ignore
      }
      this.activeAbortController = null;
    }

    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }

    this.cleanupAudioNodes();
    this.preRollBuffer.resetUtterance();
    this.clearBufferedTeeth();
    this.processedResultIndex = 0;
    this.setStage('idle', 'Ses hattı kapatıldı');
  }

  /** Açık ise kapatır, kapalı ise başlatır */
  async toggle(): Promise<boolean> {
    if (this.running) {
      this.stop();
      return false;
    }
    await this.start();
    return this.running;
  }

  /**
   * Katman 2 (LiveKit Krisp varsa bağlar, yoksa yerleşik AudioWorklet BVC'yi devreye alır)
   * ve Katman 3 (500ms Pre-Roll Ring Buffer + VAD) kurulumunu gerçekleştirir.
   */
  private async setupKrispAndWorkletLayer(
    audioCtx: AudioContext,
    micStream: MediaStream,
    conditionedOutputNode: AudioNode
  ): Promise<void> {
    let liveKitKrispAttached = false;

    // 2A. LiveKit + Krisp Entegrasyonu (Varsa otomatik bağla, yoksa hata vermeden devam et)
    try {
      const globalKrisp = (window as any).__LIVEKIT_KRISP_PROCESSOR__;
      let krispFactory = globalKrisp;

      if (!krispFactory) {
        // Bundler'ın derleme zamanında paket yokken kırılmaması için dinamik import
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const mod = await dynamicImport('@livekit/krisp-noise-filter').catch(() => null);
        if (mod && typeof mod.KrispNoiseFilter === 'function') {
          krispFactory = mod.KrispNoiseFilter;
        }
      }

      if (krispFactory) {
        const processor = typeof krispFactory === 'function' ? krispFactory() : krispFactory;
        const audioTrack = micStream.getAudioTracks()[0];
        if (processor && audioTrack && typeof (audioTrack as any).setProcessor === 'function') {
          await (audioTrack as any).setProcessor(processor);
          this.krispProcessor = processor;
          liveKitKrispAttached = true;
        } else if (processor && typeof processor.init === 'function') {
          await processor.init({ AudioContext: audioCtx });
          this.krispProcessor = processor;
          liveKitKrispAttached = true;
        }
      }
    } catch {
      // LiveKit Krisp opsiyoneldir; yerleşik AudioWorklet BVC devreye girer
      liveKitKrispAttached = false;
    }

    // 2B. Yerleşik WebAudio AudioWorklet BVC + 500ms Pre-Roll Ring Buffer
    try {
      if (audioCtx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const blob = new Blob([DENTAL_KRISP_BVC_WORKLET_CODE], {
          type: 'application/javascript',
        });
        this.workletBlobUrl = URL.createObjectURL(blob);
        await audioCtx.audioWorklet.addModule(this.workletBlobUrl);

        const workletNode = new AudioWorkletNode(audioCtx, 'dental-krisp-bvc-worklet');
        this.workletNode = workletNode;
        this.krispMode = liveKitKrispAttached ? 'livekit-krisp' : 'worklet-bvc';

        workletNode.port.onmessage = (event) => {
          if (!this.running) return;
          this.handleWorkletFrame(event.data);
        };

        // Sessiz çıkış düğümü (AudioWorklet'in tarayıcı tarafından çalıştırılması için grafik bağlı olmalıdır)
        const silentSink = audioCtx.createGain();
        silentSink.gain.value = 0;

        conditionedOutputNode.connect(workletNode);
        workletNode.connect(silentSink);
        silentSink.connect(audioCtx.destination);
        return;
      }
    } catch {
      // AudioWorklet desteklenmiyorsa AnalyserNode fallback'e geç
    }

    // 2C. AnalyserNode Fallback (Eski tarayıcılar veya test ortamları için Zero-Downtime yedek)
    this.krispMode = liveKitKrispAttached ? 'livekit-krisp' : 'fallback-analyser';
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.25;
    conditionedOutputNode.connect(analyser);

    const timeData = new Float32Array(analyser.fftSize);
    this.fallbackInterval = setInterval(() => {
      if (!this.running) return;
      analyser.getFloatTimeDomainData(timeData);
      // 16kHz 320 örnek (~20ms) çerçevesine indirge
      const downsampled = new Float32Array(FRAME_SAMPLES);
      const step = timeData.length / FRAME_SAMPLES;
      let sumSq = 0;
      let zc = 0;
      let prev = timeData[0] || 0;
      for (let i = 0; i < FRAME_SAMPLES; i++) {
        const s = timeData[Math.min(timeData.length - 1, Math.floor(i * step))];
        downsampled[i] = s;
        sumSq += s * s;
        if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zc++;
        prev = s;
      }
      const rms = Math.sqrt(sumSq / FRAME_SAMPLES);
      const zcr = zc / FRAME_SAMPLES;
      if (rms < this.currentNoiseFloorRms * 1.4) {
        this.currentNoiseFloorRms = Math.max(
          0.002,
          Math.min(0.04, this.currentNoiseFloorRms * 0.94 + rms * 0.06)
        );
      }
      const isNearFieldSpeech =
        rms > Math.max(0.009, this.currentNoiseFloorRms * 1.9) && zcr <= 0.39;
      const snrDb = 20 * Math.log10(Math.max(0.1, rms / Math.max(0.0005, this.currentNoiseFloorRms)));

      this.handleWorkletFrame({
        type: isNearFieldSpeech && !this.preRollBuffer.isCapturing ? 'SPEECH_START' : 'FRAME',
        samples: downsampled,
        rms,
        noiseFloor: this.currentNoiseFloorRms,
        snrDb,
        speechBandRatio: isNearFieldSpeech ? 0.72 : 0.35,
        zcr,
        level: isNearFieldSpeech ? Math.min(1, rms * 6) : 0,
        rawLevel: Math.min(1, rms * 5),
        isNearFieldSpeech,
        passSpeech: isNearFieldSpeech,
        suppressed: !isNearFieldSpeech && rms > this.currentNoiseFloorRms * 1.25,
      });
    }, 20);
  }

  /**
   * AudioWorklet (veya fallback) tarafından gönderilen her 20ms'lik ses çerçevesini işler:
   * - 500ms Pre-Roll Ring Buffer'ı besler,
   * - VAD `SPEECH_START` algılandığında 500ms öncesinden itibaren WAV kaydını başlatır,
   * - `isAnalyzing === true` iken 180ms kesintisiz yakın-alan konuşma tespit edilirse Barge-In tetikler!
   */
  public handleWorkletFrame(frameData: {
    type?: 'SPEECH_START' | 'FRAME';
    samples?: Float32Array;
    rms: number;
    noiseFloor: number;
    snrDb: number;
    speechBandRatio?: number;
    zcr?: number;
    level?: number;
    rawLevel?: number;
    isNearFieldSpeech: boolean;
    passSpeech?: boolean;
    suppressed?: boolean;
  }): void {
    const now = Date.now();
    const {
      type = 'FRAME',
      samples,
      rms,
      noiseFloor,
      snrDb,
      speechBandRatio = 0.7,
      zcr = 0.1,
      level = 0,
      rawLevel = 0,
      isNearFieldSpeech,
      passSpeech = isNearFieldSpeech,
      suppressed = false,
    } = frameData;

    this.currentNoiseFloorRms = noiseFloor;
    this.currentSnrDb = snrDb;

    // 1. 500ms Pre-Roll Ring Buffer güncellemesi
    if (type === 'SPEECH_START' && !this.preRollBuffer.isCapturing) {
      this.preRollBuffer.startUtteranceCapture();
    }
    if (samples && samples.length > 0) {
      this.preRollBuffer.pushFrame(samples, Boolean(passSpeech));
    }

    // 2. Yakın-alan konuşma takibi ve Barge-In (Gerçek Araya Girme) kontrolü
    if (isNearFieldSpeech && !suppressed) {
      this.lastNearFieldSpeechAt = now;
      this.consecutiveNearFieldMs += 20;
      if (rms > this.peakUtteranceRms) {
        this.peakUtteranceRms = rms;
      }

      // Katman 4: Gerçek Araya Girme (Barge-In Detection)
      // AI bir komutu analiz ederken hekim mikrofona yakın alanda en az 180ms kesintisiz konuşursa:
      if (
        this.analyzing &&
        this.consecutiveNearFieldMs >= this.options.bargeInMinSpeechMs &&
        now - this.lastBargeInAt > 600
      ) {
        this.triggerBargeIn(this.consecutiveNearFieldMs, rms, noiseFloor, snrDb);
      } else if (
        !this.analyzing &&
        this.stage === 'listening' &&
        this.consecutiveNearFieldMs >= 40
      ) {
        this.setStage('speech_detected', 'Yakın alan hekim konuşması algılandı (500ms pre-roll aktif)');
      }
    } else {
      this.consecutiveNearFieldMs = 0;
    }

    // 3. Canlı ses seviyesi telemetrisi
    this.options.onLevelChange?.(level, {
      level,
      rawLevel,
      rms,
      noiseFloor,
      snrDb,
      speechBandRatio,
      zcr,
      isNearFieldSpeech,
      suppressed,
      krispMode: this.krispMode,
    });
  }

  /**
   * Katman 4 — Gerçek Araya Girme (Barge-In) tetikleyicisi.
   * Devam eden AI isteğini `AbortController` ile iptal eder ve yeni komutu dinlemeye geçer.
   */
  public triggerBargeIn(
    durationMs = this.options.bargeInMinSpeechMs,
    rms = this.peakUtteranceRms,
    noiseFloorRms = this.currentNoiseFloorRms,
    snrDb = this.currentSnrDb
  ): void {
    this.lastBargeInAt = Date.now();
    let abortedActiveRequest = false;

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort('barge_in');
        abortedActiveRequest = true;
      } catch {
        // Ignore
      }
      this.activeAbortController = null;
    }

    this.analyzing = false;
    this.consecutiveNearFieldMs = 0;
    this.lastDispatchedText = '';
    this.preRollBuffer.startUtteranceCapture();

    this.setStage('barge_in', 'Hekim araya girdi (Barge-In) — önceki AI analizi iptal edildi');
    this.options.onBargeIn?.({
      durationMs,
      rms,
      noiseFloorRms,
      snrDb,
      abortedActiveRequest,
      timestamp: this.lastBargeInAt,
    });
  }

  /**
   * Katman 4 & 5 — Web Speech API (`maxAlternatives = 5`) ve Turn Agent kurulumu.
   */
  private setupSpeechRecognition(SpeechRecognitionCtor: any): void {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = this.options.lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = this.options.maxAlternatives;
    recognition.continuous = true;

    recognition.onstart = () => {
      this.processedResultIndex = 0;
    };

    recognition.onspeechstart = () => {
      if (!this.preRollBuffer.isCapturing) {
        this.preRollBuffer.startUtteranceCapture();
      }
      if (!this.analyzing && this.stage === 'listening') {
        this.setStage('speech_detected', 'Konuşma başlangıcı algılandı');
      }
    };

    recognition.onresult = (event: any) => {
      this.handleRecognitionResult(event);
    };

    recognition.onerror = (event: any) => {
      if (event?.error === 'no-speech' || event?.error === 'aborted') {
        return;
      }
      const isFatal = ['not-allowed', 'audio-capture', 'service-not-allowed'].includes(
        event?.error
      );
      const message = this.getVoiceErrorMessage(event?.error || 'unknown');
      if (isFatal) {
        this.hasFatalError = true;
        this.stop();
      }
      this.emitError(event?.error || 'unknown', message, isFatal);
    };

    recognition.onend = () => {
      if (this.running && !this.hasFatalError) {
        this.recognitionRestartTimer = setTimeout(() => {
          if (!this.running || this.hasFatalError || !this.recognition) return;
          this.processedResultIndex = 0;
          try {
            this.recognition.start();
          } catch {
            // Zaten çalışıyorsa yoksay
          }
        }, 140);
      }
    };

    this.recognition = recognition;
    recognition.start();
  }

  /**
   * STT sonuçlarını (`maxAlternatives = 5`), Diş Numarası Sayma Duraksamasını (`enumerationHoldMs = 2400`)
   * ve LiveKit Turn Agent kurallarını işler.
   */
  public handleRecognitionResult(event: {
    results: ArrayLike<
      ArrayLike<{ transcript: string; confidence?: number }> & { isFinal?: boolean }
    >;
    resultIndex?: number;
  }): void {
    const now = Date.now();
    const results = event.results;
    if (!results || results.length === 0) return;

    const latestRes = results[results.length - 1];
    const latestConfidence = latestRes?.[0]?.confidence ?? 1;
    const hasRecentNearFieldVoice = now - this.lastNearFieldSpeechAt < 4800;

    // Uzak alan / çok düşük güvenli arka plan seslerini ele
    if (
      latestRes?.isFinal &&
      latestConfidence > 0 &&
      latestConfidence < 0.36 &&
      !hasRecentNearFieldVoice
    ) {
      this.processedResultIndex = results.length;
      return;
    }

    // Eğer AI analiz yaparken yakın alanda yeni bir dental komut söylendiyse ve Barge-In henüz tetiklenmediyse:
    if (this.analyzing) {
      if (hasRecentNearFieldVoice && this.consecutiveNearFieldMs >= this.options.bargeInMinSpeechMs) {
        this.triggerBargeIn(this.consecutiveNearFieldMs);
      } else {
        this.processedResultIndex = results.length;
        return;
      }
    }

    if (!this.preRollBuffer.isCapturing) {
      this.preRollBuffer.startUtteranceCapture();
    }

    // Eğer STT oturumu yenilendiyse (results dizisi sıfırlandıysa veya resultIndex geriye düştüyse) indeksi sıfırla
    if (
      results.length <= this.processedResultIndex ||
      (typeof event.resultIndex === 'number' && event.resultIndex < this.processedResultIndex)
    ) {
      this.processedResultIndex = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
    }

    const startIdx = Math.min(this.processedResultIndex, results.length);
    const finalSegments: string[] = [];
    let interimSegment = '';
    const collectedAlternativesSet = new Set<string>();

    for (let i = startIdx; i < results.length; i++) {
      const res = results[i];
      if (!res || res.length === 0) continue;

      const altArray: Array<{ transcript: string; confidence?: number }> = [];
      for (let a = 0; a < res.length; a++) {
        if (res[a]?.transcript) {
          altArray.push({
            transcript: res[a].transcript,
            confidence: res[a].confidence,
          });
        }
      }

      const merged = mergeAlternativesForDentalCommand(
        altArray,
        this.procedureNames,
        this.indicationNames
      );
      for (const altText of merged.alternatives) {
        collectedAlternativesSet.add(altText);
      }

      const segText = merged.primaryText;
      if (!segText) continue;

      // Kapatma komutu kontrolü ("asistanı kapat", "dinlemeyi kapat")
      if (checkCloseTrigger(segText)) {
        this.options.onCloseCommand?.(segText);
        this.stop();
        return;
      }

      // Alternatiflerden kurtarılan diş numaraları varsa ve henüz tamponda yoksa ekle
      if (merged.extractedTeeth.length > 0) {
        for (const t of merged.extractedTeeth) {
          if (VALID_FDI_TEETH.has(t) && !this._bufferedTeeth.includes(t)) {
            this._bufferedTeeth.push(t);
            this.bufferedTeethUpdatedAt = now;
          }
        }
      }

      if (res.isFinal) {
        if (
          finalSegments.length === 0 &&
          this._bufferedTeeth.length === 0 &&
          !this.pendingClauseText &&
          !hasDentalDomainSignal(segText, this.procedureNames, this.indicationNames)
        ) {
          this.processedResultIndex = i + 1;
          continue;
        }
        finalSegments.push(segText);
      } else {
        interimSegment += segText + ' ';
      }
    }

    // Önceki duraksamadan kalan taze (18 sn içinde) diş/komut öneki varsa koru
    const hasFreshPrefix =
      Boolean(this.pendingClauseText) && now - this.bufferedTeethUpdatedAt < 18000;

    const combinedRaw = [
      hasFreshPrefix ? this.pendingClauseText : '',
      ...finalSegments,
      interimSegment.trim(),
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!combinedRaw && this._bufferedTeeth.length === 0) return;

    if (checkCloseTrigger(combinedRaw)) {
      this.options.onCloseCommand?.(combinedRaw);
      this.stop();
      return;
    }

    const normalizedCombined = normalizeDentalCommandNumbers(combinedRaw);

    // Söylenen metindeki tüm FDI diş numaralarını `bufferedTeeth` tamponuna işle
    const teethInCombined = extractFdiTeethFromText(normalizedCombined);
    for (const tooth of teethInCombined) {
      if (!this._bufferedTeeth.includes(tooth)) {
        this._bufferedTeeth.push(tooth);
      }
      this.bufferedTeethUpdatedAt = now;
    }

    if (
      !hasDentalDomainSignal(normalizedCombined, this.procedureNames, this.indicationNames) &&
      this._bufferedTeeth.length === 0
    ) {
      return;
    }

    const extractedClause = extractDentalCommandClause(
      normalizedCombined,
      this.procedureNames,
      this.indicationNames
    );
    const fullCommandText = combineBufferedTeethWithCommand(
      this._bufferedTeeth,
      extractedClause
    );

    if (collectedAlternativesSet.size > 0) {
      this.latestAlternatives = Array.from(collectedAlternativesSet).map((alt) =>
        combineBufferedTeethWithCommand(this._bufferedTeeth, extractDentalCommandClause(alt, this.procedureNames, this.indicationNames))
      );
    } else if (fullCommandText) {
      this.latestAlternatives = [fullCommandText];
    }

    // Eğer final segment geldiyse ve interim kalmadıysa önek tamponunu güncelle
    if (finalSegments.length > 0 && !interimSegment.trim()) {
      this.pendingClauseText = fullCommandText;
      this.bufferedTeethUpdatedAt = now;
      this.processedResultIndex = results.length;
    }

    const isLastSegmentFinal = Boolean(latestRes?.isFinal);
    this.clearTurnTimers();

    // =========================================================================
    // KATMAN 4A: Diş Numarası Sayma Duraksaması (Enumeration Hold — 2400ms)
    // Hekim "15 ... 16 ... 17" dediğinde henüz işlem/eylem kelimesi gelmediyse
    // cümleyi KAPATMAZ, `enumerationHoldMs = 2400` ms boyunca bekler ve dişleri biriktirir!
    // =========================================================================
    if (isOnlyToothEnumeration(fullCommandText, this.procedureNames, this.indicationNames)) {
      this.setStage(
        'holding_numbers',
        `Diş numaraları biriktiriliyor (${this._bufferedTeeth.join(', ')}) — işlem bekleniyor`
      );
      this.options.onTranscriptChange?.(fullCommandText, {
        isFinal: isLastSegmentFinal,
        bufferedTeeth: this.bufferedTeeth,
        stage: 'holding_numbers',
      });

      this.enumerationHoldTimer = setTimeout(() => {
        if (!this.running || this.analyzing) return;
        // 2400ms dolduğunda bile sadece diş numarası söylendiyse dişleri tamponda tutmaya devam et,
        // hekimin ardından söyleyeceği "zirkonyum ekle" komutunu bekle!
        this.bufferedTeethUpdatedAt = Date.now();
        this.setStage(
          'holding_numbers',
          `Dişler hafızada tutuluyor (${this._bufferedTeeth.join(', ')}) — yapılacak işlemi söyleyin`
        );
      }, this.options.enumerationHoldMs);

      return;
    }

    // İşlem veya eylem kelimesi de geldiyse stage'i güncelle
    this.setStage('speech_detected', 'Dental komut algılandı');
    this.options.onTranscriptChange?.(fullCommandText, {
      isFinal: isLastSegmentFinal,
      bufferedTeeth: this.bufferedTeeth,
      stage: this.stage,
    });

    if (
      fullCommandText === this.lastDispatchedText &&
      now - this.lastDispatchedAt < 2500
    ) {
      return;
    }

    // =========================================================================
    // KATMAN 4B: Açık Eylem Kelimesi ("ekle", "sil", "düzenle", "seç", "kaydet")
    // =========================================================================
    const matchedAction = checkActionTrigger(
      fullCommandText,
      this.procedureNames,
      this.indicationNames
    );

    if (matchedAction) {
      const delay = isLastSegmentFinal ? 150 : 420;
      this.actionTriggerTimer = setTimeout(() => {
        if (!this.running || this.analyzing) return;
        this.finalizeAndDispatchCommand(fullCommandText, 'action_keyword', results.length);
      }, delay);
      return;
    }

    // =========================================================================
    // KATMAN 4C: Diş Numarası + İşlem Adı (veya Bölge Seçimi) + Doğal Sessizlik / LiveKit Turn EOU
    // =========================================================================
    const normCmd = normalizeSpeechText(fullCommandText);
    const hasTeethAndProcedure =
      (this._bufferedTeeth.length > 0 || hasFdiToothNumber(normCmd)) &&
      hasDentalTerm(normCmd, this.procedureNames, this.indicationNames);
    const hasRegionCommand =
      /(?:^|\s)(tüm ağız|tüm dişler|bütün dişler|tüm üst|üst çene|tüm alt|alt çene|birinci kadran|ikinci kadran|üçüncü kadran|dördüncü kadran|sağ üst kadran|sol üst kadran|sol alt kadran|sağ alt kadran|ön dişler|arka dişler)(?=$|\s)/i.test(
        normCmd
      );

    if (hasTeethAndProcedure || hasRegionCommand) {
      const turnEval = evaluateLiveKitTurkishTurn(fullCommandText);
      const holdMs =
        turnEval.status === 'incomplete'
          ? Math.max(this.options.procedureSilenceMs, turnEval.recommendedSilenceMs + 450)
          : this.options.procedureSilenceMs;

      this.procedureSilenceTimer = setTimeout(() => {
        if (!this.running || this.analyzing) return;
        this.finalizeAndDispatchCommand(fullCommandText, 'procedure_silence', results.length);
      }, holdMs);
    }
  }

  /**
   * Katman 5 — Utterance tamamlandığında 16kHz Mono WAV (`audioBase64`),
   * `maxAlternatives = 5` alternatif metin adayları ve `bufferedTeeth` listesini
   * `onCommandReady` callback'i ile AI katmanına teslim eder.
   */
  private finalizeAndDispatchCommand(
    rawCommandText: string,
    triggerReason: DentalCommandReadyPayload['triggerReason'],
    resultsLength: number
  ): void {
    const finalCommandText = combineBufferedTeethWithCommand(
      this._bufferedTeeth,
      rawCommandText
    ).trim();
    if (!finalCommandText) return;

    const now = Date.now();
    if (
      finalCommandText === this.lastDispatchedText &&
      now - this.lastDispatchedAt < 2000
    ) {
      return;
    }

    const teethSnapshot = [...this._bufferedTeeth];
    for (const t of extractFdiTeethFromText(finalCommandText)) {
      if (!teethSnapshot.includes(t)) {
        teethSnapshot.push(t);
      }
    }

    const alternativesSnapshot =
      this.latestAlternatives.length > 0
        ? Array.from(new Set([finalCommandText, ...this.latestAlternatives])).slice(
            0,
            this.options.maxAlternatives
          )
        : [finalCommandText];

    const { audioBase64, durationMs } = this.preRollBuffer.flushToWavBase64(true);
    const peakRms = this.peakUtteranceRms;
    const noiseFloorRms = this.currentNoiseFloorRms;
    const snrDb = this.currentSnrDb;

    // Bir sonraki komut için tamponları sıfırla
    this.lastDispatchedText = finalCommandText;
    this.lastDispatchedAt = now;
    this.processedResultIndex = resultsLength;
    this.clearBufferedTeeth();
    this.latestAlternatives = [];
    this.peakUtteranceRms = 0;

    const payload: DentalCommandReadyPayload = {
      text: finalCommandText,
      alternatives: alternativesSnapshot,
      bufferedTeeth: teethSnapshot,
      audioBase64,
      audioMimeType: 'audio/wav',
      stage: this.stage,
      triggerReason,
      audioStats: {
        durationMs,
        peakRms,
        noiseFloorRms,
        snrDb,
        krispMode: this.krispMode,
        preRollIncludedMs: this.options.preRollMs,
      },
    };

    void this.options.onCommandReady(payload);
  }

  /** Mevcut 500ms pre-roll + utterance tamponunun anlık 16kHz WAV Base64 görüntüsünü döndürür */
  getSnapshotWavBase64(): string | null {
    return this.preRollBuffer.flushToWavBase64(false).audioBase64;
  }

  private setStage(nextStage: DentalPipelineStage, reasonTr?: string): void {
    const changed = this.stage !== nextStage;
    this.stage = nextStage;
    if (changed || nextStage === 'holding_numbers' || nextStage === 'barge_in') {
      this.options.onStageChange?.(nextStage, {
        stage: nextStage,
        bufferedTeeth: this.bufferedTeeth,
        transcript: this.pendingClauseText || undefined,
        krispMode: this.krispMode,
        reasonTr,
      });
    }
  }

  private emitError(code: string, message: string, fatal: boolean): void {
    this.options.onError?.({ code, message, fatal });
  }

  private getVoiceErrorMessage(error: string): string {
    const messages: Record<string, string> = {
      'not-allowed':
        'Mikrofon izni reddedildi. Tarayıcının adres çubuğundan bu site için mikrofonu izinli yapın ve işletim sistemi mikrofon ayarlarını kontrol edin.',
      'audio-capture':
        'Kullanılabilir bir mikrofon bulunamadı. Mikrofonun bağlı ve başka bir uygulama tarafından kullanılmıyor olduğundan emin olun.',
      'service-not-allowed':
        'Tarayıcının konuşma tanıma servisine erişimine izin verilmiyor. Chrome veya Edge ayarlarını kontrol edip yeniden deneyin.',
      network:
        'Konuşma tanıma servisine ulaşılamadı. Ağ bağlantısını kontrol edip yeniden deneyin.',
    };
    return messages[error] || 'Sesli komut başlatılamadı. Lütfen yeniden deneyin.';
  }

  private clearTurnTimers(): void {
    if (this.enumerationHoldTimer) {
      clearTimeout(this.enumerationHoldTimer);
      this.enumerationHoldTimer = null;
    }
    if (this.actionTriggerTimer) {
      clearTimeout(this.actionTriggerTimer);
      this.actionTriggerTimer = null;
    }
    if (this.procedureSilenceTimer) {
      clearTimeout(this.procedureSilenceTimer);
      this.procedureSilenceTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearTurnTimers();
    if (this.recognitionRestartTimer) {
      clearTimeout(this.recognitionRestartTimer);
      this.recognitionRestartTimer = null;
    }
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }

  private cleanupAudioNodes(): void {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // Ignore
      }
      this.workletNode = null;
    }
    if (this.workletBlobUrl) {
      try {
        URL.revokeObjectURL(this.workletBlobUrl);
      } catch {
        // Ignore
      }
      this.workletBlobUrl = null;
    }
    if (this.krispProcessor && typeof this.krispProcessor.destroy === 'function') {
      try {
        void this.krispProcessor.destroy();
      } catch {
        // Ignore
      }
      this.krispProcessor = null;
    }
    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // Ignore
      }
      this.audioContext = null;
    }
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((t) => t.stop());
      } catch {
        // Ignore
      }
      this.stream = null;
    }
  }
}
