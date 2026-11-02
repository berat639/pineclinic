/**
 * Arayüz Türkçe sözlüğü: tek kaynak (DRY).
 * Kod adları ve İngilizce terimler kullanıcıya gösterilmez; ekranda yalnızca buradaki karşılıklar kullanılır.
 */

/** Koşul alanları (akış koşullarında kullanılan değişken adları). */
export const FIELD_LABELS = {
  'caller.isKnownPatient': 'Kayıtlı hasta mı?',
  'caller.isVip': 'Özel hattan mı arıyor?',
  'caller.hasUpcomingAppointment': 'Yaklaşan randevusu var mı?',
  'clinic.isOpen': 'Klinik şu an açık mı?',
  'time.hour': 'Saat',
  'time.weekday': 'Haftanın günü',
  'call.direction': 'Görüşme yönü',
  'call.channel': 'Görüşme kanalı',
  'call.silenceCount': 'Sessiz kalma sayısı',
  'call.durationSec': 'Görüşme süresi (saniye)',
} as const

/** Koşul işleçleri. `regex` listeden kaldırıldı; eski akışlarda çalışmaya devam eder. */
export const OPERATOR_LABELS = {
  equals: 'eşitse',
  notEquals: 'eşit değilse',
  startsWith: 'ile başlıyorsa',
  in: 'şunlardan biriyse',
  gt: 'büyükse',
  gte: 'en az',
  lt: 'küçükse',
  lte: 'en fazla',
  between: 'arasındaysa',
  isEmpty: 'cevap verilmediyse',
  notEmpty: 'cevap verildiyse',
} as const

/** Seçim listesinde gösterilmeyen ama eski akışlarda çalışan işleçler. */
export const HIDDEN_OPERATORS = ['regex'] as const

/** Mantıksal bağlaçlar. */
export const LOGIC_LABELS = {
  AND: 've',
  OR: 'veya',
} as const

/** Akış aksiyonları. */
export const ACTION_LABELS = {
  set_variable: 'Bilgiyi kaydet',
  send_sms: 'Kısa mesaj gönder',
  wait_reprompt: 'Cevap gelmezse tekrar sor',
  switch_prompt: 'Konuşma tarzını değiştir',
} as const

/** Genel terimler. */
export const TERM_LABELS = {
  variables: 'Toplanan bilgiler',
  validation: 'Akış kontrolü',
  inbound: 'Gelen arama',
  outbound: 'Giden arama',
  greeting: 'Karşılama mesajı',
  doctorBlock: 'Hekim listesi',
  knowledgeBlock: 'Bilgi bankası',
  prompt: 'Talimat',
  token: 'Yapay zeka kullanımı',
  webhook: 'bağlantı adresi',
} as const

/** Kullanıcıya gösterilmeyen iç adlar (yalnızca belge amaçlı). */
export const INTERNAL_ONLY_TERMS = ['fieldErrors', 'ConfirmModal'] as const

export type FieldKey = keyof typeof FIELD_LABELS
export type OperatorKey = keyof typeof OPERATOR_LABELS
export type LogicKey = keyof typeof LOGIC_LABELS
export type ActionKey = keyof typeof ACTION_LABELS
export type TermKey = keyof typeof TERM_LABELS

function lookup(table: Readonly<Record<string, string>>, key: string, fallback?: string): string {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (fallback ?? key)
}

export const fieldLabel = (key: string, fallback?: string): string => lookup(FIELD_LABELS, key, fallback)
export const operatorLabel = (key: string, fallback?: string): string => lookup(OPERATOR_LABELS, key, fallback)
export const actionLabel = (key: string, fallback?: string): string => lookup(ACTION_LABELS, key, fallback)
export const termLabel = (key: string, fallback?: string): string => lookup(TERM_LABELS, key, fallback)
export const logicLabel = (key: string): string => lookup(LOGIC_LABELS, key.toUpperCase(), key)

/** Seçim listesi için işleç seçenekleri (gizli işleçler hariç). */
export const operatorOptions = (): ReadonlyArray<{ value: OperatorKey; label: string }> =>
  (Object.keys(OPERATOR_LABELS) as OperatorKey[]).map(value => ({ value, label: OPERATOR_LABELS[value] }))

/** Seçim listesi için alan seçenekleri. */
export const fieldOptions = (): ReadonlyArray<{ value: FieldKey; label: string }> =>
  (Object.keys(FIELD_LABELS) as FieldKey[]).map(value => ({ value, label: FIELD_LABELS[value] }))
