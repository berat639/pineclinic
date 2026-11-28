import { sql } from 'drizzle-orm'
import { PROMPT_SECTIONS, getDefaultPromptValue } from '../data/default-prompts'

export function renderPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] ?? ''
  })
}

/**
 * Eski "klinik" tabanlı talimat metinlerini Türkçe ek uyumunu koruyarak
 * "işletme" tabanlı metinlere dönüştürür (tek seferlik platform göçü için).
 */
export function replaceKlinikWithIsletmeInPrompt(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/Yardımcı olabileceğim bir klinik işleminiz yoksa/g, 'İşletmemizle ilgili yardımcı olabileceğim bir işleminiz yoksa'],
    [/Yardımcı olabileceğim bir klinik işleminiz olmadığı için/g, 'İşletmemizle ilgili yardımcı olabileceğim bir işleminiz olmadığı için'],
    [/yardımcı olabileceğim bir klinik işleminiz yoksa/g, 'işletmemizle ilgili yardımcı olabileceğim bir işleminiz yoksa'],
    [/yardımcı olabileceğim bir klinik işleminiz olmadığı için/g, 'işletmemizle ilgili yardımcı olabileceğim bir işleminiz olmadığı için'],
    [/Sen bir diş kliniğinin/g, 'Sen bir işletmenin'],
    [/Diş kliniğinin/g, 'İşletmenin'],
    [/diş kliniğinin/g, 'işletmenin'],
    [/Diş kliniği/g, 'İşletme'],
    [/diş kliniği/g, 'işletme'],
    [/KLİNİĞİMİZ/g, 'İŞLETMEMİZ'],
    [/KLİNİĞİN/g, 'İŞLETMENİN'],
    [/KLİNİĞE/g, 'İŞLETMEYE'],
    [/Kliniğimizin/g, 'İşletmemizin'],
    [/kliniğimizin/g, 'işletmemizin'],
    [/Kliniğimizden/g, 'İşletmemizden'],
    [/kliniğimizden/g, 'işletmemizden'],
    [/Kliniğimize/g, 'İşletmemize'],
    [/kliniğimize/g, 'işletmemize'],
    [/Kliniğimizde/g, 'İşletmemizde'],
    [/kliniğimizde/g, 'işletmemizde'],
    [/Kliniğimiz/g, 'İşletmemiz'],
    [/kliniğimiz/g, 'işletmemiz'],
    [/Kliniğinize/g, 'İşletmenize'],
    [/kliniğinize/g, 'işletmenize'],
    [/Kliniğinizde/g, 'İşletmenizde'],
    [/kliniğinizde/g, 'işletmenizde'],
    [/Kliniğiniz/g, 'İşletmeniz'],
    [/kliniğiniz/g, 'işletmeniz'],
    [/Kliniğinin/g, 'İşletmesinin'],
    [/kliniğinin/g, 'işletmesinin'],
    [/Kliniğine/g, 'İşletmesine'],
    [/kliniğine/g, 'işletmesine'],
    [/Kliniğin/g, 'İşletmenin'],
    [/kliniğin/g, 'işletmenin'],
    [/Kliniğe/g, 'İşletmeye'],
    [/kliniğe/g, 'işletmeye'],
    [/Kliniği/g, 'İşletmeyi'],
    [/kliniği/g, 'işletmeyi'],
    [/Klinikle/g, 'İşletmeyle'],
    [/klinikle/g, 'işletmeyle'],
    [/Klinikte/g, 'İşletmede'],
    [/klinikte/g, 'işletmede'],
    [/Klinikten/g, 'İşletmeden'],
    [/klinikten/g, 'işletmeden'],
    [/KLİNİK/g, 'İŞLETME'],
    [/Klinik/g, 'İşletme'],
    [/klinik/g, 'işletme'],
  ]
  let out = text
  for (const [pattern, replacement] of rules) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * Çözümleme sırası: platform talimatı (platform_settings: prompt.*) → kod varsayılanı.
 * Klinik bazlı kopyalar (clinic_settings prompt.*) artık okunmaz; veri silinmez.
 */
const PLATFORM_CACHE_TTL_MS = 15_000
let platformCache: { map: Map<string, string>; expiresAt: number } | null = null
let historyTableReady = false

export function invalidatePlatformPromptCache(): void {
  platformCache = null
}

/** Idempotent, kendi kendini onaran tablo oluşturma (migration atlansa bile çalışır). */
export async function ensurePlatformPromptTable(): Promise<void> {
  if (historyTableReady) return
  try {
    const { db } = await import('../db/client')
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_prompt_history (
        id         BIGSERIAL PRIMARY KEY,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        action     TEXT NOT NULL DEFAULT 'update',
        changed_by UUID,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS platform_prompt_history_key_idx ON platform_prompt_history (key, changed_at DESC)`)
    historyTableReady = true
  } catch (err) {
    console.warn('[PromptRegistry] Platform talimat tabloları hazırlanamadı:', err instanceof Error ? err.message : 'unknown')
  }
}

async function loadPlatformPrompts(): Promise<Map<string, string>> {
  const now = Date.now()
  if (platformCache && platformCache.expiresAt > now) return platformCache.map
  const map = new Map<string, string>()
  try {
    await ensurePlatformPromptTable()
    const { db } = await import('../db/client')
    const rows = await db.execute<{ key: string; value: string }>(
      sql`SELECT key, value FROM platform_settings WHERE key LIKE 'prompt.%'`,
    )
    for (const row of rows) {
      if (row.value && row.value.trim()) map.set(row.key, row.value)
    }
  } catch {
    // Okunamazsa kod varsayılanları kullanılır.
  }
  platformCache = { map, expiresAt: now + PLATFORM_CACHE_TTL_MS }
  return map
}

/** Platform değeri (varsa) yoksa kod varsayılanı. */
export async function getPlatformPromptValue(key: string): Promise<string> {
  const map = await loadPlatformPrompts()
  return map.get(key) ?? getDefaultPromptValue(key) ?? ''
}

/** Tüm bölümler için etkin değer: { [key]: değer }. Prompt birleştirme için kullanılır. */
export async function getEffectivePromptSections(): Promise<Record<string, string>> {
  const map = await loadPlatformPrompts()
  const out: Record<string, string> = {}
  for (const section of PROMPT_SECTIONS) out[section.key] = map.get(section.key) ?? section.defaultValue
  return out
}

/** `clinicId` geriye uyumluluk için korunur; talimatlar platform düzeyindedir. */
export async function getPromptTemplate(key: string, _clinicId?: string): Promise<string> {
  return getPlatformPromptValue(key)
}

/** Klinik kopyası kodla birebir aynıysa "özelleştirilmemiş" sayılır. */
export function isCustomizedClinicCopy(key: string, value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false
  return value !== (getDefaultPromptValue(key) ?? '')
}

/**
 * Eskiden varsayılanları her kliniğe kopyalıyordu. Artık kopyalama YAPILMAZ;
 * yalnızca platform tabloları hazırlanır. Mevcut klinik kopyalarına dokunulmaz.
 */
export async function ensurePromptTemplates(): Promise<void> {
  await ensurePlatformPromptTable()
}
