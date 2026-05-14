/**
 * rag.ts — Semantic RAG engine
 * Embedding: Google text-embedding-004 via @google/genai (Vertex AI)
 * Retrieval: PostgreSQL pgvector cosine similarity with HNSW index
 */

import { GoogleGenAI } from '@google/genai'
import { retrieveTopK as retrieveDocsByEmbedding, type RankedDoc } from './db/repositories/knowledge'

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
  if (!values || values.length === 0) throw new Error('Embedding API boş vektör döndürdü')
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

const CATEGORY_LABELS: Record<string, string> = {
  genel: 'GENEL BİLGİLER', servis: 'SERVİS BİLGİLERİ',
  galeri: 'GALERİ & SATIŞ', kampanya: 'KAMPANYALAR',
  sss: 'SIK SORULAN SORULAR', arac: 'ARAÇ BİLGİLERİ',
}

export function buildRagPrompt(docs: RankedDoc[]): string {
  if (docs.length === 0) return ''
  const grouped = new Map<string, RankedDoc[]>()
  for (const doc of docs) {
    if (!grouped.has(doc.category)) grouped.set(doc.category, [])
    grouped.get(doc.category)!.push(doc)
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

export const PRE_WARM_QUERY =
  'Hyundai otomotiv servis bakım araç satış test sürüşü randevu galeri kampanya'
