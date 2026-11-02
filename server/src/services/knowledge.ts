/**
 * services/knowledge.ts — PostgreSQL / pgvector tabanlı RAG arama servisi
 */
import { embedText as ragEmbedText, retrieveTopK } from '../rag'
import { searchByText } from '../db/repositories/knowledge'

export type KnowledgeSearchResult = {
  id?: string
  chunkText: string
  score: number
  documentName: string
}

export interface SearchKnowledgeOptions {
  limit?: number
  direction?: string
  channel?: string
}

/** Search knowledge base using pgvector similarity + text fallback */
export async function searchKnowledge(
  query: string,
  optionsOrLimit: number | SearchKnowledgeOptions = 5,
): Promise<KnowledgeSearchResult[]> {
  const opts: SearchKnowledgeOptions = typeof optionsOrLimit === 'number'
    ? { limit: optionsOrLimit }
    : optionsOrLimit
  const limit = opts.limit ?? 5
  const direction = opts.direction || (opts.channel === 'whatsapp' ? 'whatsapp' : 'inbound')

  const allResults: KnowledgeSearchResult[] = []
  const seenIds = new Set<string>()

  // 1. Embedding-based arama
  try {
    const results = await retrieveTopK(query, limit, direction)
    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id)
        allResults.push({ id: r.id, chunkText: r.content, score: r.score, documentName: r.title })
      }
    }
  } catch (err) {
    console.error('[Knowledge] Embedding arama hatası:', err)
  }

  // 2. Text-based arama — her zaman çalıştır, embedding sonuçlarını tamamlar
  try {
    const textResults = await searchByText(query, limit, direction)
    for (const r of textResults) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id)
        allResults.push({ id: r.id, chunkText: r.content, score: r.score, documentName: r.title })
      }
    }
  } catch (err) {
    console.error('[Knowledge] Text fallback hatası:', err)
  }

  // Score'a göre sırala, limit kadar döndür
  allResults.sort((a, b) => b.score - a.score)
  return allResults.slice(0, limit)
}

export async function embedText(text: string): Promise<number[]> {
  return ragEmbedText(text)
}
