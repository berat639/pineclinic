import { createHash } from 'node:crypto'
import { currentClinicId } from '../tenancy/context'
import { recordAiTokenUsage } from '../db/repositories/ai-usage'
import { getGeminiClient } from './gemini-client'

/**
 * GÜVENLİK VE GİZLİLİK SINIRI:
 * Bu servis yalnızca akış şemasındaki tek bir adımın yapısal özetini
 * ("Ne yapar · Hangi durumda gelinir · Sonra nereye gider · Uyarı") doğal
 * Türkçe bir cümleye dönüştürür. Hasta verisi, telefon numarası, randevu
 * kaydı veya konuşma geçmişi ASLA okunmaz ve dış sağlayıcıya gönderilmez.
 */

export interface FlowNodeSummaryInput {
  does?: string
  when?: string[]
  next?: string[]
  warnings?: string[]
}

export interface ExplainFlowNodeInput {
  clinicId?: string | null
  graphHash?: string
  nodeId: string
  summary?: FlowNodeSummaryInput
  nodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>
  edges?: Array<{ id?: string; source: string; target: string; sourceHandle?: string | null }>
}

export interface ExplainFlowNodeResult {
  text: string
  source: 'groq' | 'gemini' | 'local'
  cached: boolean
}

const REQUEST_TIMEOUT_MS = 8_000
const CACHE_TTL_MS = 30 * 60 * 1_000
const MAX_CACHE_ENTRIES = 500
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

interface CacheEntry {
  text: string
  source: 'groq' | 'gemini' | 'local'
  expiresAt: number
}

const explainCache = new Map<string, CacheEntry>()

export function clearFlowExplainCache(): void {
  explainCache.clear()
}

function sanitizeLine(value: unknown, maxLen = 240): string {
  if (typeof value !== 'string') return ''
  // Olası uzun rakam dizilerini (telefon/kimlik vb.) maskele
  return value
    .replace(/\b\d{7,}\b/g, '***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

function sanitizeList(list: unknown, maxItems = 6): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map(item => sanitizeLine(item))
    .filter(Boolean)
    .slice(0, maxItems)
}

function buildSummaryFromGraph(
  nodeId: string,
  nodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
  edges?: Array<{ id?: string; source: string; target: string; sourceHandle?: string | null }>,
): Required<FlowNodeSummaryInput> {
  const safeNodes = Array.isArray(nodes) ? nodes : []
  const safeEdges = Array.isArray(edges) ? edges : []
  const target = safeNodes.find(n => n.id === nodeId)
  const label = sanitizeLine(target?.data?.label, 80) || 'Bu adım'
  const does = sanitizeLine(target?.data?.description, 160) || `${label} adımını çalıştırır.`
  const incoming = safeEdges.filter(e => e.target === nodeId)
  const outgoing = safeEdges.filter(e => e.source === nodeId)
  return {
    does,
    when: incoming.length > 0 ? [`Önceki ${incoming.length} bağlantıdan gelindiğinde`] : ['Akış başlangıcında'],
    next: outgoing.map(e => {
      const nextNode = safeNodes.find(n => n.id === e.target)
      return sanitizeLine(nextNode?.data?.label, 80) || 'Sonraki adım'
    }),
    warnings: [],
  }
}

function normalizeSummary(input: ExplainFlowNodeInput): Required<FlowNodeSummaryInput> {
  if (input.summary && typeof input.summary === 'object') {
    const does = sanitizeLine(input.summary.does) || 'Bu adım görüşme akışındaki ilgili işlemi yürütür.'
    const when = sanitizeList(input.summary.when)
    const next = sanitizeList(input.summary.next)
    const warnings = sanitizeList(input.summary.warnings)
    return {
      does,
      when: when.length > 0 ? when : ['Akış sırası bu adıma geldiğinde'],
      next,
      warnings,
    }
  }
  return buildSummaryFromGraph(input.nodeId, input.nodes, input.edges)
}

function computeCacheKey(clinicId: string | null | undefined, input: ExplainFlowNodeInput, summary: Required<FlowNodeSummaryInput>): string {
  const rawHash = sanitizeLine(input.graphHash, 120)
  const summarySignature = createHash('sha256')
    .update(JSON.stringify({ nodeId: input.nodeId, rawHash, summary }))
    .digest('hex')
    .slice(0, 20)
  return `${clinicId || 'shared'}:${rawHash || 'nohash'}:${input.nodeId}:${summarySignature}`
}

function setCached(key: string, entry: CacheEntry): void {
  if (explainCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = explainCache.keys().next().value
    if (oldestKey) explainCache.delete(oldestKey)
  }
  explainCache.set(key, entry)
}

/**
 * Yapay zekâ erişilemediğinde yerel özeti doğal ve anlaşılır Türkçe cümleye dönüştürür.
 */
export function buildDeterministicFlowExplanation(summary: Required<FlowNodeSummaryInput>): string {
  const doesPart = summary.does.endsWith('.') ? summary.does : `${summary.does}.`
  const whenPart =
    summary.when.length > 0
      ? `Bu adıma ${summary.when.join(' veya ')} durumunda gelinir.`
      : ''
  const nextPart =
    summary.next.length > 0
      ? `Ardından ${summary.next.join(' ya da ')} adımına geçilir.`
      : 'Bu adımdan sonra akış tamamlanır.'
  const warnPart =
    summary.warnings.length > 0
      ? `Dikkat: ${summary.warnings.join(' ')}`
      : ''

  return [doesPart, whenPart, nextPart, warnPart].filter(Boolean).join(' ')
}

const SYSTEM_INSTRUCTION = [
  'Sen bir diş kliniği yönetim panelindeki görüşme akışı yardımcısısın.',
  'Sana verilen adım özetini klinik çalışanına 1 veya 2 kısa, akıcı ve doğal Türkçe cümleyle açıkla.',
  'Kesinlikle İngilizce kelime, kod adı (caller.isVip vb.), süslü parantez veya sembolik operatör (==, !=, AND, OR) kullanma; yalnızca "ve" / "veya" bağlaçlarını kullan.',
].join(' ')

function buildUserPrompt(summary: Required<FlowNodeSummaryInput>): string {
  const lines = [
    `Ne yapar: ${summary.does}`,
    `Hangi durumda gelinir: ${summary.when.join(' | ')}`,
  ]
  if (summary.next.length > 0) {
    lines.push(`Sonra nereye gider: ${summary.next.join(' | ')}`)
  }
  if (summary.warnings.length > 0) {
    lines.push(`Uyarı: ${summary.warnings.join(' | ')}`)
  }
  lines.push('Bu adımı klinik personeline tek paragrafta, sade ve doğal Türkçe ile kısaca anlat.')
  return lines.join('\n')
}

async function callGroqWithTimeout(
  apiKey: string,
  summary: Required<FlowNodeSummaryInput>,
  clinicId: string | null | undefined,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.25,
        max_tokens: 180,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: buildUserPrompt(summary) },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) return null
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    if (data.usage) {
      void recordAiTokenUsage({
        clinicId,
        source: 'simulator',
        promptTokens: Number(data.usage.prompt_tokens ?? 0),
        responseTokens: Number(data.usage.completion_tokens ?? 0),
        totalTokens: Number(data.usage.total_tokens ?? 0),
        callCount: 1,
      })
    }

    const text = data.choices?.[0]?.message?.content?.trim() || ''
    return text ? sanitizeLine(text, 420) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function callGeminiWithTimeout(
  summary: Required<FlowNodeSummaryInput>,
  clinicId: string | null | undefined,
): Promise<string | null> {
  const ai = await getGeminiClient(clinicId ?? undefined).catch(() => null)
  if (!ai) return null

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<null>(resolve => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, REQUEST_TIMEOUT_MS)
  })

  try {
    const modelName = process.env.GEMINI_SIMULATION_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash'
    const genPromise = ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(summary) }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.25,
        maxOutputTokens: 180,
        abortSignal: controller.signal,
      },
    })

    const result = await Promise.race([genPromise, timeoutPromise])
    if (!result) return null

    const meta = (result as any).usageMetadata
    if (meta) {
      void recordAiTokenUsage({
        clinicId,
        source: 'simulator',
        promptTokens: Number(meta.promptTokenCount ?? 0),
        responseTokens: Number(meta.candidatesTokenCount ?? 0),
        totalTokens: Number(meta.totalTokenCount ?? 0),
        callCount: 1,
      })
    }

    const text = (result.text || '').trim()
    return text ? sanitizeLine(text, 420) : null
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function explainFlowNode(input: ExplainFlowNodeInput): Promise<ExplainFlowNodeResult> {
  const effectiveClinicId = input.clinicId ?? currentClinicId()
  const cleanSummary = normalizeSummary(input)
  const cacheKey = computeCacheKey(effectiveClinicId, input, cleanSummary)
  const now = Date.now()

  const cached = explainCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return { text: cached.text, source: cached.source, cached: true }
  }

  // 1. GROQ_API_KEY tanımlıysa önce Groq (llama-3.3-70b-versatile)
  const groqKey = (process.env.GROQ_API_KEY || '').trim()
  if (groqKey) {
    const groqText = await callGroqWithTimeout(groqKey, cleanSummary, effectiveClinicId)
    if (groqText) {
      setCached(cacheKey, { text: groqText, source: 'groq', expiresAt: now + CACHE_TTL_MS })
      return { text: groqText, source: 'groq', cached: false }
    }
  }

  // 2. Kliniğin kendi AI istemcisi (yoksa ortak Gemini anahtarı)
  const geminiText = await callGeminiWithTimeout(cleanSummary, effectiveClinicId)
  if (geminiText) {
    setCached(cacheKey, { text: geminiText, source: 'gemini', expiresAt: now + CACHE_TTL_MS })
    return { text: geminiText, source: 'gemini', cached: false }
  }

  // 3. Deterministik yerel Türkçe yedek
  const fallbackText = buildDeterministicFlowExplanation(cleanSummary)
  return { text: fallbackText, source: 'local', cached: false }
}
