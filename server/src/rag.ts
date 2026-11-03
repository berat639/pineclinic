/**
 * rag.ts — Semantic RAG engine
 * Embedding: Google Gemini Embedding via @google/genai (Gemini API)
 * Retrieval: PostgreSQL pgvector cosine similarity with HNSW index + chunking + LRU query cache
 */

import { createHash } from 'crypto'
import { retrieveTopK as retrieveDocsByEmbedding, type RankedDoc } from './db/repositories/knowledge'
import { listCategories } from './db/repositories/categories'
import { getGeminiClient } from './services/gemini-client'
import { recordAiTokenUsage } from './db/repositories/ai-usage'

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001'
const DEFAULT_EMBEDDING_DIMENSIONS = 768

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

export interface EmbedOptions {
  taskType?: EmbedTaskType
  title?: string
  skipCache?: boolean
}

export function getEmbeddingModel(): string {
  return (process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim()
}

export function getEmbeddingDimensions(): number {
  const raw = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || DEFAULT_EMBEDDING_DIMENSIONS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_EMBEDDING_DIMENSIONS
}

// ── Clinic-independent Query Embedding LRU + TTL Cache ────────────────────────

const QUERY_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const queryEmbeddingCache = new Map<string, { embedding: number[]; expiresAt: number }>()

function getQueryCacheMaxSize(): number {
  const raw = Number(process.env.RAG_QUERY_CACHE_SIZE || 500)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 500
}

function normalizeQueryKey(model: string, dims: number, query: string): string {
  const normalized = query.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
  return `${model}:${dims}:${normalized}`
}

export function clearQueryEmbeddingCache(): void {
  queryEmbeddingCache.clear()
}

export async function embedText(
  text: string,
  options?: EmbedOptions | EmbedTaskType,
): Promise<number[]> {
  const opts: EmbedOptions = typeof options === 'string' ? { taskType: options } : (options ?? {})
  const taskType: EmbedTaskType = opts.taskType ?? (opts.title ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_DOCUMENT')
  const model = getEmbeddingModel()
  const dims = getEmbeddingDimensions()

  const isQuery = taskType === 'RETRIEVAL_QUERY' && !opts.skipCache
  const cacheKey = isQuery ? normalizeQueryKey(model, dims, text) : ''
  if (isQuery && cacheKey) {
    const cached = queryEmbeddingCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now() && cached.embedding.length === dims) {
      // Refresh LRU order
      queryEmbeddingCache.delete(cacheKey)
      queryEmbeddingCache.set(cacheKey, cached)
      return cached.embedding
    }
    if (cached) queryEmbeddingCache.delete(cacheKey)
  }

  const client = await getGeminiClient()
  const result = await client.models.embedContent({
    model,
    contents: text,
    config: {
      outputDimensionality: dims,
      taskType,
      ...(taskType === 'RETRIEVAL_DOCUMENT' && opts.title ? { title: opts.title } : {}),
    },
  })
  const estTokens = Math.max(1, Math.ceil(text.length / 4))
  void recordAiTokenUsage({
    source: 'embedding',
    promptTokens: estTokens,
    totalTokens: estTokens,
    callCount: 1,
  })
  const values = result.embeddings?.[0]?.values
  if (!values || values.length === 0) throw new Error('Embedding API boş vektör döndürdü')
  if (values.length !== dims) {
    throw new Error(`Embedding boyutu beklenenden farklı: ${values.length} (beklenen: ${dims})`)
  }

  if (isQuery && cacheKey) {
    const maxSize = getQueryCacheMaxSize()
    if (queryEmbeddingCache.size >= maxSize) {
      const oldestKey = queryEmbeddingCache.keys().next().value
      if (oldestKey) queryEmbeddingCache.delete(oldestKey)
    }
    queryEmbeddingCache.set(cacheKey, {
      embedding: values,
      expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
    })
  }

  return values
}

export async function embedTextsBatch(
  items: Array<{ text: string; title?: string; taskType?: EmbedTaskType }>,
  concurrency = 4,
): Promise<number[][]> {
  if (items.length === 0) return []
  const results = new Array<number[]>(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      const item = items[idx]!
      results[idx] = await embedText(item.text, {
        taskType: item.taskType ?? 'RETRIEVAL_DOCUMENT',
        title: item.title,
      })
    }
  })
  await Promise.all(workers)
  return results
}

// ── Document Chunking & Hashing ───────────────────────────────────────────────

export function computeContentHash(title: string, content: string): string {
  return createHash('sha256')
    .update(`${title.trim()}\n---\n${content.trim()}`)
    .digest('hex')
}

/**
 * Splits a document into semantic chunks (~800 chars with ~120 chars overlap)
 * respecting markdown headings, blank-line paragraphs, and sentence boundaries.
 */
export function chunkDocumentText(
  content: string,
  maxChars = 800,
  overlapChars = 120,
): string[] {
  const cleaned = content.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []
  if (cleaned.length <= maxChars) return [cleaned]

  // Split by markdown headings or double newlines first
  const rawBlocks = cleaned
    .split(/\n(?=#{1,4}\s)|\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)

  const blocks: string[] = []
  for (const block of rawBlocks) {
    if (block.length <= maxChars) {
      blocks.push(block)
    } else {
      // Split oversized paragraph by sentences or lines
      const sentences = block.split(/(?<=[.!?…\n])\s+/).map(s => s.trim()).filter(Boolean)
      let buf = ''
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          if (buf) {
            blocks.push(buf)
            buf = ''
          }
          for (let start = 0; start < sentence.length; start += maxChars - overlapChars) {
            blocks.push(sentence.slice(start, start + maxChars).trim())
          }
        } else if (!buf) {
          buf = sentence
        } else if (buf.length + 1 + sentence.length <= maxChars) {
          buf = `${buf} ${sentence}`
        } else {
          blocks.push(buf)
          buf = sentence
        }
      }
      if (buf) blocks.push(buf)
    }
  }

  // Merge small blocks up to maxChars with overlap
  const chunks: string[] = []
  let current = ''
  for (const block of blocks) {
    if (!current) {
      current = block
      continue
    }
    if (current.length + 2 + block.length <= maxChars) {
      current = `${current}\n\n${block}`
    } else {
      chunks.push(current)
      // Carry tail overlap from previous chunk if beneficial
      const tail = overlapChars > 0 && current.length > overlapChars
        ? current.slice(-overlapChars).replace(/^\S*\s/, '').trim()
        : ''
      current = tail && tail.length + 2 + block.length <= maxChars
        ? `${tail}\n${block}`
        : block
    }
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [cleaned.slice(0, maxChars)]
}

let cachedPreWarmEmbedding: number[] | null = null
let pendingPreWarmPromise: Promise<number[]> | null = null
const preWarmedRagContextCache = new Map<string, { context: string; expiresAt: number }>()
const PRE_WARM_CONTEXT_TTL_MS = 5 * 60 * 1000

export function invalidatePreWarmedRagCache(clinicId?: string): void {
  if (!clinicId) {
    preWarmedRagContextCache.clear()
    return
  }
  for (const key of preWarmedRagContextCache.keys()) {
    if (key.startsWith(`${clinicId}:`)) preWarmedRagContextCache.delete(key)
  }
}

export async function getPreWarmEmbedding(): Promise<number[]> {
  if (cachedPreWarmEmbedding) return cachedPreWarmEmbedding
  if (pendingPreWarmPromise) return pendingPreWarmPromise
  console.log('Caching PRE_WARM_QUERY embedding...')
  pendingPreWarmPromise = embedText(PRE_WARM_QUERY, { taskType: 'RETRIEVAL_QUERY' })
    .then(vec => {
      cachedPreWarmEmbedding = vec
      pendingPreWarmPromise = null
      return vec
    })
    .catch(err => {
      pendingPreWarmPromise = null
      throw err
    })
  return pendingPreWarmPromise
}

export async function getPreWarmedRagContext(clinicId?: string | null, direction = 'inbound', maxWaitMs = 250): Promise<string> {
  const key = `${clinicId || 'default'}:${direction}`
  const now = Date.now()
  const hit = preWarmedRagContextCache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit.context
  }

  const refreshTask = (async () => {
    try {
      const emb = await getPreWarmEmbedding()
      const topDocs = await retrieveDocsByEmbedding(emb, 5, direction === 'web' ? 'inbound' : direction)
      const ctx = topDocs.length > 0 ? await buildRagPrompt(topDocs) : ''
      preWarmedRagContextCache.set(key, { context: ctx, expiresAt: Date.now() + PRE_WARM_CONTEXT_TTL_MS })
      return ctx
    } catch {
      return hit?.context ?? ''
    }
  })()

  if (hit) {
    // Stale-while-revalidate: eski bağlamı 0ms'de döndür, arka planda yenile
    void refreshTask
    return hit.context
  }

  return Promise.race([
    refreshTask,
    new Promise<string>(resolve => setTimeout(() => resolve(''), maxWaitMs)),
  ])
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export type { RankedDoc } from './db/repositories/knowledge'

export const DEFAULT_RAG_MIN_SCORE = 0.55

export async function resolveRagMinScore(): Promise<number> {
  try {
    const { getSetting } = await import('./db/repositories/settings')
    const raw = await getSetting('ai.rag_min_score')
    if (raw !== null && raw !== undefined && raw !== '') {
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 0.95) {
        return parsed
      }
    }
  } catch {
    // Fallback to default if no tenant context or DB error
  }
  return DEFAULT_RAG_MIN_SCORE
}

/**
 * Retrieve top-K most similar docs to the query string.
 * Embeds the query with RETRIEVAL_QUERY + LRU cache, then performs cosine search in pgvector.
 */
export async function retrieveTopK(query: string, k = 5, direction: string = 'inbound'): Promise<RankedDoc[]> {
  const [queryEmbedding, minScore] = await Promise.all([
    embedText(query, { taskType: 'RETRIEVAL_QUERY' }),
    resolveRagMinScore(),
  ])
  return retrieveDocsByEmbedding(queryEmbedding, k, direction, { minScore })
}

// ── Prompt builder ────────────────────────────────────────────────────────────

async function getCategoryLabels(): Promise<Record<string, string>> {
  try {
    const cats = await listCategories()
    const map: Record<string, string> = {}
    for (const c of cats) map[c.slug] = c.label.toUpperCase()
    return map
  } catch {
    return {}
  }
}

export async function buildRagPrompt(docs: RankedDoc[]): Promise<string> {
  if (docs.length === 0) return ''
  const labels = await getCategoryLabels()
  const grouped = new Map<string, RankedDoc[]>()
  for (const doc of docs) {
    if (!grouped.has(doc.category)) grouped.set(doc.category, [])
    grouped.get(doc.category)!.push(doc)
  }
  const sections: string[] = []
  for (const [cat, catDocs] of grouped) {
    const label = labels[cat] ?? cat.toUpperCase()
    const items = catDocs.map(d => `• ${d.title}: ${d.content}`).join('\n')
    sections.push(`[${label}]\n${items}`)
  }
  return `

══════════════════════════════════════
📚 GÜNCEL BİLGİ BANKASI
Aşağıdaki bilgileri konuşmada doğal şekilde kullan.
Müşteri sormadan öne çıkarma, ama sorulunca mutlaka bu bilgileri kullan.
══════════════════════════════════════

${sections.join('\n\n')}

══════════════════════════════════════
ÖNEMLİ: Bu bilgileri liste şeklinde sıralama. Doğal konuşma dilinde aktar.
══════════════════════════════════════`
}

// ── Pre-warm query ────────────────────────────────────────────────────────────

export const PRE_WARM_QUERY =
  'Diş kliniği randevu muayene tedavi dolgu implant kanal tedavisi kampanya'
