/**
 * rag.ts — Semantic RAG engine
 * Embedding: Google Gemini Embedding via @google/genai (Gemini API)
 * Retrieval: PostgreSQL pgvector cosine similarity with HNSW index
 */

import { GoogleGenAI } from '@google/genai'
import { retrieveTopK as retrieveDocsByEmbedding, type RankedDoc } from './db/repositories/knowledge'

// ── Embedding client ──────────────────────────────────────────────────────────

function getEmbeddingClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || 'DUMMY_KEY'
  if (apiKey === 'DUMMY_KEY') console.warn('GEMINI_API_KEY tanımlı değil, dummy key kullanılıyor')
  return new GoogleGenAI({ apiKey })
}

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001'
const DEFAULT_EMBEDDING_DIMENSIONS = 768

export function getEmbeddingModel(): string {
  return (process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim()
}

export function getEmbeddingDimensions(): number {
  const raw = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || DEFAULT_EMBEDDING_DIMENSIONS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_EMBEDDING_DIMENSIONS
}

export async function embedText(text: string): Promise<number[]> {
  const client = getEmbeddingClient()
  const model = getEmbeddingModel()
  const dims = getEmbeddingDimensions()
  const result = await client.models.embedContent({
    model,
    contents: text,
    config: {
      outputDimensionality: dims,
    },
  })
  const values = result.embeddings?.[0]?.values
  if (!values || values.length === 0) throw new Error('Embedding API boş vektör döndürdü')
  if (values.length !== dims) {
    throw new Error(`Embedding boyutu beklenenden farklı: ${values.length} (beklenen: ${dims})`)
  }
  return values
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export type { RankedDoc } from './db/repositories/knowledge'

/**
 * Retrieve top-K most similar docs to the query string.
 * Embeds the query, then performs cosine search in pgvector.
 */
export async function retrieveTopK(query: string, k = 5): Promise<RankedDoc[]> {
  const queryEmbedding = await embedText(query)
  return retrieveDocsByEmbedding(queryEmbedding, k)
}

// ── Prompt builder ────────────────────────────────────────────────────────────

import { listCategories } from './db/repositories/categories'

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
  'Skoda otomotiv servis bakım araç satış test sürüşü randevu galeri kampanya'
