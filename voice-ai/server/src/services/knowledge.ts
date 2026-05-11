/**
 * Knowledge base service — RAG pipeline using Gemini text-embedding-004 via Vertex AI.
 * Documents are chunked, embedded, and stored in pgvector.
 * Search uses cosine similarity (<=> operator).
 */
import { sql, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { knowledgeDocuments } from '../db/schema'
import { accountPool } from '../accounts/pool'

const CHUNK_CHARS = 2400    // ~600 tokens per chunk (gemini-embedding-001 supports 2048 tokens)
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
const EMBEDDING_DIMS = 768

export type KnowledgeSearchResult = {
  chunkText: string
  score: number
  documentName: string
}

/** Split text into paragraph-aware chunks */
function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20)

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= CHUNK_CHARS) {
      current = current ? `${current}\n\n${para}` : para
    } else {
      if (current) chunks.push(current)
      // If single paragraph too long, split by sentence
      if (para.length > CHUNK_CHARS) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para]
        let sentChunk = ''
        for (const s of sentences) {
          if (sentChunk.length + s.length <= CHUNK_CHARS) {
            sentChunk += s
          } else {
            if (sentChunk) chunks.push(sentChunk.trim())
            sentChunk = s
          }
        }
        if (sentChunk) chunks.push(sentChunk.trim())
        current = ''
      } else {
        current = para
      }
    }
  }
  if (current) chunks.push(current)
  return chunks.filter(c => c.trim().length > 20)
}

/** Embed text using text-embedding-004 via Vertex AI (uses first available account) */
export async function embedText(text: string): Promise<number[]> {
  const entries = accountPool.getAll()
  if (entries.length === 0) throw new Error('[Knowledge] Hesap bulunamadı — embedding yapılamaz')
  const client = entries[0].client
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMS },
  })
  const values = (result as { embeddings?: Array<{ values?: number[] }> }).embeddings?.[0]?.values
  if (!values?.length) throw new Error('[Knowledge] Embedding boş döndü')
  return values
}

/** Extract text content from any file using Gemini's multimodal capability */
export async function extractTextFromFile(
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  // Plain text types — read directly
  const textMimeTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
  if (textMimeTypes.some(t => mimeType.startsWith(t))) {
    return new TextDecoder().decode(buffer)
  }

  const entries = accountPool.getAll()
  if (entries.length === 0) throw new Error('[Knowledge] Hesap bulunamadı — metin çıkartılamaz')
  const client = entries[0].client

  console.log(`[Knowledge] "${fileName}" (${mimeType}) → Gemini ile metin çıkartılıyor`)

  const result = await client.models.generateContent({
    model: process.env.GEMINI_EXTRACT_MODEL || 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        {
          text: 'Bu dosyadaki tüm metin içeriğini, bilgileri ve verileri eksiksiz çıkar. Başlıklar, listeler ve yapısal bilgileri koru. Yalnızca içeriği döndür, açıklama yapma.',
        },
        {
          inlineData: {
            mimeType,
            data: Buffer.from(buffer).toString('base64'),
          },
        },
      ],
    }],
  })

  const text = (result as unknown as { text?: () => string }).text?.() ?? result.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text.trim()) throw new Error(`[Knowledge] "${fileName}" dosyasından metin çıkartılamadı`)
  return text
}

/**
 * Generate a short summary of a binary file using Gemini Flash.
 * Used as chunk_text when full text extraction is not possible.
 */
async function generateFileSummary(buffer: ArrayBuffer, mimeType: string, name: string): Promise<string> {
  const entries = accountPool.getAll()
  if (entries.length === 0) return `[${mimeType}: ${name}]`
  const client = entries[0].client
  try {
    const result = await client.models.generateContent({
      model: process.env.GEMINI_EXTRACT_MODEL || 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { text: 'Bu dosyanın içeriğini 3-5 cümleyle Türkçe özetle. Yalnızca özeti döndür.' },
          { inlineData: { mimeType, data: Buffer.from(buffer).toString('base64') } },
        ],
      }],
    })
    return (result as unknown as { text?: () => string }).text?.()
      ?? result.candidates?.[0]?.content?.parts?.[0]?.text
      ?? `[${mimeType}: ${name}]`
  } catch {
    return `[${mimeType}: ${name}]`
  }
}

/**
 * Index a binary file by generating a Gemini summary and embedding that as text.
 * Creates a single chunk with the generated summary as chunk_text.
 */
export async function indexDocumentDirect(
  name: string,
  mimeType: string,
  buffer: ArrayBuffer,
): Promise<string> {
  console.log(`[Knowledge] "${name}" → summary embedding`)
  const summary = await generateFileSummary(buffer, mimeType, name)
  const embedding = await embedText(`title: ${name} | text: ${summary}`)

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({ name, fileType: mimeType, originalText: summary, chunkCount: 1 })
    .returning({ id: knowledgeDocuments.id })

  const vectorLiteral = `[${embedding.join(',')}]`
  await db.execute(sql`
    INSERT INTO knowledge_chunks (document_id, chunk_index, chunk_text, embedding)
    VALUES (${doc!.id}, 0, ${summary}, ${vectorLiteral}::vector)
  `)

  console.log(`[Knowledge] "${name}" direkt indexlendi (id: ${doc!.id})`)
  return doc!.id
}

/** Index a document: chunk → embed → insert into knowledge_chunks */
export async function indexDocument(
  name: string,
  fileType: string,
  text: string,
): Promise<string> {
  const chunks = chunkText(text)
  console.log(`[Knowledge] "${name}" → ${chunks.length} chunk`)

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({ name, fileType, originalText: text, chunkCount: chunks.length })
    .returning({ id: knowledgeDocuments.id })

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(`title: ${name} | text: ${chunks[i]}`)
    const vectorLiteral = `[${embedding.join(',')}]`
    await db.execute(sql`
      INSERT INTO knowledge_chunks (document_id, chunk_index, chunk_text, embedding)
      VALUES (${doc!.id}, ${i}, ${chunks[i]}, ${vectorLiteral}::vector)
    `)
  }

  console.log(`[Knowledge] "${name}" indexlendi (id: ${doc!.id})`)
  return doc!.id
}

/** Delete document and all its chunks (CASCADE handles chunks) */
export async function deleteDocument(id: string): Promise<void> {
  await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id))
  console.log(`[Knowledge] Döküman silindi: ${id}`)
}

/** List all documents (without original_text for brevity) */
export async function listDocuments(): Promise<Array<{
  id: string; name: string; fileType: string; chunkCount: number; createdAt: Date | null
}>> {
  const rows = await db.execute(sql`
    SELECT id, name, file_type, chunk_count, created_at
    FROM knowledge_documents
    ORDER BY created_at DESC
  `)
  return (rows as unknown as Array<{
    id: string; name: string; file_type: string; chunk_count: number; created_at: Date
  }>).map(r => ({
    id: r.id,
    name: r.name,
    fileType: r.file_type,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }))
}

/** Search knowledge base using cosine similarity */
export async function searchKnowledge(
  query: string,
  limit = 3,
): Promise<KnowledgeSearchResult[]> {
  const embedding = await embedText(`task: search result | query: ${query}`)
  const vectorLiteral = `[${embedding.join(',')}]`

  const rows = await db.execute(sql`
    SELECT
      kc.chunk_text,
      kd.name AS document_name,
      1 - (kc.embedding <=> ${vectorLiteral}::vector) AS score
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    ORDER BY kc.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `)

  return (rows as unknown as Array<{ chunk_text: string; document_name: string; score: number }>).map(r => ({
    chunkText: r.chunk_text,
    score: Number(r.score),
    documentName: r.document_name,
  }))
}
