/**
 * services/knowledge.ts — JSON tabanlı RAG köprüsü
 * PostgreSQL/pgvector yerine knowledge.json + cosine similarity kullanır
 */
import { embedText as ragEmbedText, retrieveTopK } from '../rag'
import { searchByText } from '../db/repositories/knowledge'

export type KnowledgeSearchResult = {
  id?: string
  chunkText: string
  score: number
  documentName: string
}

/** Search knowledge base using our JSON-based RAG engine */
export async function searchKnowledge(
  query: string,
  limit = 5,
): Promise<KnowledgeSearchResult[]> {
  const allResults: KnowledgeSearchResult[] = []
  const seenIds = new Set<string>()

  // 1. Embedding-based arama
  try {
    const results = await retrieveTopK(query, limit)
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
    const textResults = await searchByText(query, limit)
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

// Stub exports for API compatibility
export async function indexDocument(...args: any[]): Promise<string> { return '' }
export async function indexDocumentDirect(...args: any[]): Promise<string> { return '' }
export async function deleteDocument(...args: any[]): Promise<void> {}
export async function listDocuments(...args: any[]): Promise<[]> { return [] }
export async function extractTextFromFile(...args: any[]): Promise<string> { return '' }
