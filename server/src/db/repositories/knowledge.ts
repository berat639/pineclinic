import { sql as drizzleSql, eq } from 'drizzle-orm'
import { db } from '../client'
import { knowledgeDocuments } from '../schema'

export type KnowledgeCategory = 'genel' | 'servis' | 'galeri' | 'kampanya' | 'sss' | 'arac'

export interface KnowledgeDoc {
  id: string
  category: KnowledgeCategory
  title: string
  content: string
  active: boolean
  embeddedAt: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocWithEmbedding extends KnowledgeDoc {
  embedding: number[]
}

function toIso(d: Date | null | undefined): string {
  return d ? d.toISOString() : ''
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}

export async function listDocs(): Promise<KnowledgeDoc[]> {
  const rows = await db
    .select({
      id: knowledgeDocuments.id,
      category: knowledgeDocuments.category,
      title: knowledgeDocuments.title,
      content: knowledgeDocuments.content,
      active: knowledgeDocuments.active,
      embeddedAt: knowledgeDocuments.embeddedAt,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
    })
    .from(knowledgeDocuments)
    .orderBy(knowledgeDocuments.createdAt)
  return rows.map(r => ({
    id: r.id,
    category: (r.category ?? 'genel') as KnowledgeCategory,
    title: r.title,
    content: r.content,
    active: r.active ?? true,
    embeddedAt: toIso(r.embeddedAt),
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }))
}

export async function countEmbedded(): Promise<{ total: number; embedded: number }> {
  const result = await db.execute(drizzleSql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(embedding)::int AS embedded
    FROM knowledge_documents
  `)
  const row = (result as unknown as { rows?: Array<{ total: number; embedded: number }> }).rows?.[0]
    ?? (Array.isArray(result) ? (result[0] as { total: number; embedded: number }) : { total: 0, embedded: 0 })
  return { total: Number(row.total), embedded: Number(row.embedded) }
}

export async function createDoc(
  data: Pick<KnowledgeDoc, 'category' | 'title' | 'content' | 'active'>,
  embedding: number[],
): Promise<KnowledgeDoc> {
  const nowIso = new Date().toISOString()
  const hasEmbedding = embedding.length > 0
  const insertResult = await db.execute(drizzleSql`
    INSERT INTO knowledge_documents (category, title, content, active, embedding, embedded_at, created_at, updated_at)
    VALUES (
      ${data.category},
      ${data.title},
      ${data.content},
      ${data.active},
      ${hasEmbedding ? drizzleSql`${vectorLiteral(embedding)}::vector` : drizzleSql`NULL`},
      ${hasEmbedding ? nowIso : null},
      ${nowIso},
      ${nowIso}
    )
    RETURNING id, category, title, content, active, embedded_at, created_at, updated_at
  `)
  const row = ((insertResult as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (insertResult as unknown as Array<Record<string, unknown>>))[0]
  return {
    id: row.id as string,
    category: (row.category as KnowledgeCategory) ?? 'genel',
    title: row.title as string,
    content: row.content as string,
    active: row.active as boolean,
    embeddedAt: row.embedded_at ? new Date(row.embedded_at as string).toISOString() : '',
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export async function updateDoc(
  id: string,
  data: Partial<Pick<KnowledgeDoc, 'category' | 'title' | 'content' | 'active'>>,
  newEmbedding?: number[],
): Promise<KnowledgeDoc | null> {
  const nowIso = new Date().toISOString()

  // Build SET clause dynamically using template literals
  const sets: ReturnType<typeof drizzleSql>[] = []
  if (data.category !== undefined) sets.push(drizzleSql`category = ${data.category}`)
  if (data.title !== undefined) sets.push(drizzleSql`title = ${data.title}`)
  if (data.content !== undefined) sets.push(drizzleSql`content = ${data.content}`)
  if (data.active !== undefined) sets.push(drizzleSql`active = ${data.active}`)
  if (newEmbedding !== undefined) {
    if (newEmbedding.length > 0) {
      sets.push(drizzleSql`embedding = ${vectorLiteral(newEmbedding)}::vector`)
      sets.push(drizzleSql`embedded_at = ${nowIso}`)
    } else {
      sets.push(drizzleSql`embedding = NULL`)
      sets.push(drizzleSql`embedded_at = NULL`)
    }
  }
  sets.push(drizzleSql`updated_at = ${nowIso}`)

  if (sets.length === 1) {
    const rows = await listDocs()
    return rows.find(d => d.id === id) ?? null
  }

  const setClause = drizzleSql.join(sets, drizzleSql`, `)
  const result = await db.execute(drizzleSql`
    UPDATE knowledge_documents
    SET ${setClause}
    WHERE id = ${id}
    RETURNING id, category, title, content, active, embedded_at, created_at, updated_at
  `)
  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))[0]
  if (!row) return null
  return {
    id: row.id as string,
    category: (row.category as KnowledgeCategory) ?? 'genel',
    title: row.title as string,
    content: row.content as string,
    active: row.active as boolean,
    embeddedAt: row.embedded_at ? new Date(row.embedded_at as string).toISOString() : '',
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export async function deleteDoc(id: string): Promise<boolean> {
  try {
    const rows = await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).returning({ id: knowledgeDocuments.id })
    return rows.length > 0
  } catch {
    return false
  }
}

export async function toggleDoc(id: string): Promise<KnowledgeDoc | null> {
  const result = await db.execute(drizzleSql`
    UPDATE knowledge_documents
    SET active = NOT active, updated_at = now()
    WHERE id = ${id}
    RETURNING id, category, title, content, active, embedded_at, created_at, updated_at
  `)
  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))[0]
  if (!row) return null
  return {
    id: row.id as string,
    category: (row.category as KnowledgeCategory) ?? 'genel',
    title: row.title as string,
    content: row.content as string,
    active: row.active as boolean,
    embeddedAt: row.embedded_at ? new Date(row.embedded_at as string).toISOString() : '',
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export async function updateDocEmbedding(id: string, embedding: number[]): Promise<boolean> {
  if (embedding.length === 0) return false
  const result = await db.execute(drizzleSql`
    UPDATE knowledge_documents
    SET embedding = ${vectorLiteral(embedding)}::vector,
        embedded_at = now(),
        updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `)
  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))
  return rows.length > 0
}

export interface RankedDoc {
  id: string
  category: string
  title: string
  content: string
  score: number
}

export async function retrieveTopK(queryEmbedding: number[], k = 5): Promise<RankedDoc[]> {
  if (queryEmbedding.length === 0) return []
  const result = await db.execute(drizzleSql`
    SELECT id, category, title, content,
           1 - (embedding <=> ${vectorLiteral(queryEmbedding)}::vector) AS score
    FROM knowledge_documents
    WHERE active = true AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral(queryEmbedding)}::vector
    LIMIT ${k}
  `)
  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))
  return rows.map(r => ({
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    content: r.content as string,
    score: Number(r.score),
  }))
}

/**
 * Fallback text-based search — embedding başarısız olduğunda veya sonuç
 * bulunamadığında kullanılır. Sorguyu kelimelere böler ve title/content
 * üzerinde ILIKE arar.
 */
export async function searchByText(query: string, k = 5): Promise<RankedDoc[]> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .slice(0, 8)
  if (words.length === 0) return []

  // Her kelime için ILIKE koşulu oluştur (OR mantığı — herhangi biri eşleşirse)
  const conditions = words.map(
    w => drizzleSql`(LOWER(title) LIKE ${'%' + w + '%'} OR LOWER(content) LIKE ${'%' + w + '%'})`
  )
  const whereClause = drizzleSql.join(conditions, drizzleSql` OR `)

  const result = await db.execute(drizzleSql`
    SELECT id, category, title, content, 0.5 AS score
    FROM knowledge_documents
    WHERE active = true AND (${whereClause})
    LIMIT ${k}
  `)
  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))
  return rows.map(r => ({
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    content: r.content as string,
    score: Number(r.score),
  }))
}
