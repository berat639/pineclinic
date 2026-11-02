/**
 * Bilgi Bankası form kuralları — tek kaynak.
 * Sınırlar server/src/api/knowledge.ts ve server/src/services/knowledge-extract.ts ile eşleşir.
 */

export const TITLE_MAX = 120
export const CONTENT_MIN = 10
export const CONTENT_MAX = 50_000
export const FILE_MAX_BYTES = 10 * 1024 * 1024
export const FILE_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'pdf', 'docx'] as const
export const CATEGORY_LABEL_MAX = 40
export const GREETING_MIN = 3
export const GREETING_MAX = 500
export const CALL_PHONE_DIGITS = 11

export type CallDirection = 'inbound' | 'outbound' | 'both'

export const CALL_DIRECTION_LABELS: Record<CallDirection, string> = {
  inbound: 'Gelen arama',
  outbound: 'Giden arama',
  both: 'Her ikisi',
}

/** Görünmez / kontrol karakterlerini siler (satır sonu ve sekme korunur). */
export function stripInvisible(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD\u202A-\u202E]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

/** Başlık: ardışık boşluk teke iner, en fazla 120 karakter. Yazarken sondaki tek boşluk korunur. */
export function maskTitle(raw: string): string {
  return stripInvisible(raw).replace(/\s+/g, ' ').replace(/^\s+/, '').slice(0, TITLE_MAX)
}

export function cleanTitle(raw: string): string {
  return maskTitle(raw).trim()
}

export function maskContent(raw: string): string {
  return stripInvisible(raw).replace(/\r\n?/g, '\n').slice(0, CONTENT_MAX)
}

export function cleanContent(raw: string): string {
  return maskContent(raw).trim()
}

export function maskCategoryLabel(raw: string): string {
  return stripInvisible(raw).replace(/\s+/g, ' ').replace(/^\s+/, '').slice(0, CATEGORY_LABEL_MAX)
}

export function maskGreeting(raw: string): string {
  return stripInvisible(raw).slice(0, GREETING_MAX)
}

export interface FieldCheck {
  ok: boolean
  error?: string
  hint?: string
}

export function validateTitle(raw: string, opts: { required?: boolean } = {}): FieldCheck {
  const value = cleanTitle(raw)
  if (!value) return opts.required === false ? { ok: true } : { ok: false, error: 'Belge başlığı zorunludur.' }
  if (value.length > TITLE_MAX) return { ok: false, error: `Başlık en fazla ${TITLE_MAX} karakter olabilir.` }
  return { ok: true }
}

export function validateContent(raw: string): FieldCheck {
  const length = cleanContent(raw).length
  if (length < CONTENT_MIN) {
    const remaining = CONTENT_MIN - length
    return { ok: false, error: `İçerik en az ${CONTENT_MIN} karakter olmalı.`, hint: `${remaining} karakter daha yazın` }
  }
  if (length > CONTENT_MAX) return { ok: false, error: `İçerik en fazla ${CONTENT_MAX.toLocaleString('tr-TR')} karakter olabilir.` }
  return { ok: true }
}

export function validateGreeting(raw: string): FieldCheck {
  const length = raw.trim().length
  if (length < GREETING_MIN) return { ok: false, error: `Mesaj en az ${GREETING_MIN} karakter olmalı.` }
  if (length > GREETING_MAX) return { ok: false, error: `Mesaj en fazla ${GREETING_MAX} karakter olabilir.` }
  return { ok: true }
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function validateFile(file: { name: string; size: number }): FieldCheck {
  const ext = fileExtension(file.name)
  if (!(FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: 'Desteklenen dosya türleri: TXT, MD, CSV, JSON, PDF, DOCX.' }
  }
  if (file.size > FILE_MAX_BYTES) return { ok: false, error: "Dosya 10 MB'den büyük olamaz." }
  if (file.size === 0) return { ok: false, error: 'Dosya boş görünüyor.' }
  return { ok: true }
}

/** Telefon: sunucu `0XXXXXXXXXX` (11 hane) bekler. */
export function isCompleteTrPhone(value: string): boolean {
  return /^0\d{10}$/.test(value)
}

const TR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', I: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
}

/** Kategori adından kod (slug): `^[a-z0-9_-]+$`. Boş kalırsa 'kategori'. */
export function slugifyLabel(label: string): string {
  const mapped = Array.from(label.trim()).map(ch => TR_MAP[ch] ?? ch).join('')
  const slug = mapped
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'kategori'
}

/** Mevcut kodlarla çakışırsa -2, -3 ekler. */
export function uniqueSlug(label: string, existing: Iterable<string>): string {
  const taken = new Set(Array.from(existing, s => s.toLowerCase()))
  const base = slugifyLabel(label)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Türkçe büyük/küçük harf duyarsız arama için normalleştirme (İ/i, I/ı). */
export function foldTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0307/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u')
}

export function matchesSearch(haystack: string, query: string): boolean {
  const q = foldTr(query.trim())
  if (!q) return true
  return foldTr(haystack).includes(q)
}

export type FieldKey = 'title' | 'content' | 'file' | 'category' | 'callDirection' | 'label' | 'greeting' | 'callerId' | 'phone'

/** Sunucu 400/409 yanıtını ilgili alana eşler. */
export function mapServerError(status: number, message: string): { field: FieldKey | 'form'; message: string } {
  const m = foldTr(message)
  if (status === 409 || m.includes('zaten mevcut')) return { field: 'label', message: 'Bu isimde bir kategori zaten var.' }
  if (m.includes('baslik') || m.includes('title')) return { field: 'title', message }
  if (m.includes('icerik') || m.includes('content')) return { field: 'content', message }
  if (m.includes('dosya') || m.includes('desteklenen')) return { field: 'file', message }
  if (m.includes('caller')) return { field: 'callerId', message }
  if (m.includes('karsilama')) return { field: 'greeting', message }
  if (m.includes('telefon')) return { field: 'phone', message }
  if (m.includes('slug') || m.includes('label')) return { field: 'label', message }
  return { field: 'form', message }
}

/** Kategori renk paleti (klinik tonları). */
export const CATEGORY_COLORS = [
  '#2563eb', '#0284c7', '#38bdf8', '#34d399', '#15803d', '#a78bfa', '#f472b6', '#fb923c', '#f59e0b', '#64748b',
] as const

export const CATEGORY_ICONS = ['🌐', '🦷', '✨', '🎯', '❓', '⚕️', '👤', '📋', '💊', '📅', '💳', '📞'] as const
