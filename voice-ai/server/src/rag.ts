/**
 * rag.ts — Semantic RAG engine
 *
 * Embedding: Google text-embedding-004 via @google/genai
 * Retrieval: Cosine similarity (pure TS, no deps)
 */

import { GoogleGenAI } from '@google/genai'
import { readKnowledge } from './db'

// ── Embedding client ──────────────────────────────────────────────────────────

function getEmbeddingClient(): GoogleGenAI {
  const encoded = process.env.GOOGLE_CREDENTIALS_JSON
  if (!encoded) throw new Error('GOOGLE_CREDENTIALS_JSON tanımlı değil')
  const credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION || 'europe-west1',
    googleAuthOptions: { credentials },
  })
}

const EMBEDDING_MODEL = 'text-embedding-004'

export async function embedText(text: string): Promise<number[]> {
  const client = getEmbeddingClient()
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  })
  const values = result.embeddings?.[0]?.values
  if (!values || values.length === 0) {
    throw new Error('Embedding API boş vektör döndürdü')
  }
  return values
}

// ── Math ──────────────────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export interface RankedDoc {
  id: string
  category: string
  title: string
  content: string
  score: number
}

/**
 * Retrieves top-K most relevant knowledge docs for a given query.
 * Only considers docs that are active AND have an embedding.
 */
export async function retrieveTopK(query: string, k = 5): Promise<RankedDoc[]> {
  const store = readKnowledge()
  const activeDocs = store.docs.filter(d => d.active && d.embedding.length > 0)

  if (activeDocs.length === 0) return []

  const queryEmbedding = await embedText(query)

  const scored = activeDocs.map(doc => ({
    id: doc.id,
    category: doc.category,
    title: doc.title,
    content: doc.content,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  genel:    'GENEL BİLGİLER',
  servis:   'SERVİS BİLGİLERİ',
  galeri:   'GALERİ & SATIŞ',
  kampanya: 'KAMPANYALAR',
  sss:      'SIK SORULAN SORULAR',
  arac:     'ARAÇ BİLGİLERİ',
}

/**
 * Builds the RAG context string to be injected into the system prompt.
 * Groups docs by category for clarity.
 */
export function buildRagPrompt(docs: RankedDoc[]): string {
  if (docs.length === 0) return ''

  // Group by category
  const grouped = new Map<string, RankedDoc[]>()
  for (const doc of docs) {
    const cat = doc.category
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(doc)
  }

  const sections: string[] = []
  for (const [cat, catDocs] of grouped) {
    const label = CATEGORY_LABELS[cat] ?? cat.toUpperCase()
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

/**
 * Pre-warm query for new WebSocket connections.
 * Since the session prompt cannot be updated after opening,
 * we retrieve the most relevant docs before connecting.
 */
export const PRE_WARM_QUERY =
  'Hyundai otomotiv servis bakım araç satış test sürüşü randevu galeri kampanya'
