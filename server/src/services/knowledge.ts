/**
 * services/knowledge.ts — JSON tabanlı RAG köprüsü
 * PostgreSQL/pgvector yerine knowledge.json + cosine similarity kullanır
 */
import { embedText as ragEmbedText, retrieveTopK } from '../rag'
import { searchByText } from '../db/repositories/knowledge'

export type KnowledgeSearchResult = {
  chunkText: string
  score: number
  documentName: string
}

/** Search knowledge base using our JSON-based RAG engine */
export async function searchKnowledge(
  query: string,
  limit = 3,
): Promise<KnowledgeSearchResult[]> {
  // Önce embedding-based arama dene
  try {
    const results = await retrieveTopK(query, limit)
    if (results.length > 0) {
      return results.map(r => ({
        chunkText: r.content,
        score: r.score,
        documentName: r.title,
      }))
    }
  } catch (err) {
    console.error('[Knowledge] Embedding arama hatası, text fallback deneniyor:', err)
  }

  // Embedding başarısız veya sonuç 0 — text-based fallback
  try {
    const textResults = await searchByText(query, limit)
    return textResults.map(r => ({
      chunkText: r.content,
      score: r.score,
      documentName: r.title,
    }))
  } catch (err) {
    console.error('[Knowledge] Text fallback hatası:', err)
    return []
  }
}

export async function embedText(text: string): Promise<number[]> {
  return ragEmbedText(text)
}

// Stub exports for API compatibility
export async function indexDocument(): Promise<string> { return '' }
export async function indexDocumentDirect(): Promise<string> { return '' }
export async function deleteDocument(): Promise<void> {}
export async function listDocuments(): Promise<[]> { return [] }
export async function extractTextFromFile(): Promise<string> { return '' }
