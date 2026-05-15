/**
 * services/knowledge.ts — JSON tabanlı RAG köprüsü
 * PostgreSQL/pgvector yerine knowledge.json + cosine similarity kullanır
 */
import { embedText as ragEmbedText, retrieveTopK } from '../rag'

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
  try {
    const results = await retrieveTopK(query, limit)
    return results.map(r => ({
      chunkText: r.content,
      score: r.score,
      documentName: r.title,
    }))
  } catch (err) {
    console.error('[Knowledge] Arama hatası:', err)
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
