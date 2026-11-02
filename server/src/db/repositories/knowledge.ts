import { createHash } from 'crypto'
import { and, sql as drizzleSql, eq } from 'drizzle-orm'
import { db } from '../client'
import { knowledgeDocuments } from '../schema'
import { requireClinicId } from '../../tenancy/context'
import { getEmbeddingDimensions, getEmbeddingModel } from '../../rag'

export type KnowledgeCategory = string

export interface KnowledgeDoc {
  id: string
  category: KnowledgeCategory
  title: string
  content: string
  callDirection: 'inbound' | 'outbound' | 'both'
  active: boolean
  embeddedAt: string
  embeddingModel?: string | null
  embeddingDims?: number | null
  contentHash?: string | null
  needsReindex?: boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocWithEmbedding extends KnowledgeDoc {
  embedding: number[]
}

export interface DocChunkInput {
  content: string
  embedding: number[]
}

export interface DocEmbeddingMeta {
  embeddingModel?: string
  embeddingDims?: number
  contentHash?: string
  chunks?: DocChunkInput[]
}

const TURKISH_STOPWORDS = new Set([
  've', 'ile', 'için', 'icin', 'bir', 'bu', 'şu', 'su', 'o', 'mi', 'mı', 'mu', 'mü',
  'de', 'da', 'ki', 'ne', 'nasıl', 'nasil', 'var', 'yok', 'gibi', 'kadar', 'daha',
  'çok', 'cok', 'en', 'ama', 'fakat', 'veya', 'ya', 'hem', 'ise', 'olarak', 'olan',
  'ben', 'sen', 'biz', 'siz', 'onlar', 'bana', 'sana', 'bize', 'size', 'acaba',
  'lütfen', 'lutfen', 'merhaba', 'selam', 'iyi', 'günler', 'gunler', 'teşekkür',
])

function toIso(d: Date | null | undefined): string {
  return d ? d.toISOString() : ''
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}

function hashDocContent(title: string, content: string): string {
  return createHash('sha256')
    .update(`${title.trim()}\n---\n${content.trim()}`)
    .digest('hex')
}

let schemaEnsured: Promise<void> | null = null

export async function ensureKnowledgeSchema(): Promise<void> {
  if (!schemaEnsured) {
    schemaEnsured = (async () => {
      try {
        await db.execute(drizzleSql`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {})
        await db.execute(drizzleSql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedding_model TEXT`)
        await db.execute(drizzleSql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedding_dims INTEGER`)
        await db.execute(drizzleSql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS content_hash TEXT`)
        await db.execute(drizzleSql`
          CREATE TABLE IF NOT EXISTS knowledge_doc_chunks (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            clinic_id      UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
            document_id    UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
            chunk_index    INTEGER NOT NULL DEFAULT 0,
            content        TEXT NOT NULL DEFAULT '',
            call_direction TEXT NOT NULL DEFAULT 'both',
            embedding      vector(768),
            created_at     TIMESTAMPTZ DEFAULT now()
          )
        `)
        await db.execute(drizzleSql`CREATE INDEX IF NOT EXISTS knowledge_doc_chunks_doc_idx ON knowledge_doc_chunks (document_id, chunk_index)`)
        await db.execute(drizzleSql`CREATE INDEX IF NOT EXISTS knowledge_doc_chunks_clinic_idx ON knowledge_doc_chunks (clinic_id)`)
        await db.execute(drizzleSql`CREATE INDEX IF NOT EXISTS knowledge_doc_chunks_embedding_idx ON knowledge_doc_chunks USING hnsw (embedding vector_cosine_ops)`).catch(() => {})
      } catch (err) {
        console.warn('[Knowledge] Schema ensure warning:', err)
      }
    })()
  }
  await schemaEnsured
}

export async function saveDocChunks(
  docId: string,
  callDirection: string,
  chunks: DocChunkInput[],
  clinicIdOverride?: string,
): Promise<void> {
  await ensureKnowledgeSchema()
  const clinicId = clinicIdOverride ?? requireClinicId()
  await db.execute(drizzleSql`
    DELETE FROM knowledge_doc_chunks
    WHERE document_id = ${docId} AND clinic_id = ${clinicId}
  `)
  const validChunks = chunks.filter(c => c.content.trim().length > 0 && c.embedding.length > 0)
  for (let idx = 0; idx < validChunks.length; idx++) {
    const ch = validChunks[idx]!
    await db.execute(drizzleSql`
      INSERT INTO knowledge_doc_chunks (clinic_id, document_id, chunk_index, content, call_direction, embedding)
      VALUES (
        ${clinicId},
        ${docId},
        ${idx},
        ${ch.content},
        ${callDirection || 'both'},
        ${vectorLiteral(ch.embedding)}::vector
      )
    `)
  }
}

export async function listDocs(): Promise<KnowledgeDoc[]> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  const currentModel = getEmbeddingModel()
  const currentDims = getEmbeddingDimensions()
  const rows = await db
    .select({
      id: knowledgeDocuments.id,
      category: knowledgeDocuments.category,
      title: knowledgeDocuments.title,
      content: knowledgeDocuments.content,
      callDirection: knowledgeDocuments.callDirection,
      active: knowledgeDocuments.active,
      embeddingModel: knowledgeDocuments.embeddingModel,
      embeddingDims: knowledgeDocuments.embeddingDims,
      contentHash: knowledgeDocuments.contentHash,
      embeddedAt: knowledgeDocuments.embeddedAt,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.clinicId, clinicId))
    .orderBy(knowledgeDocuments.createdAt)
  return rows.map(r => {
    const expectedHash = hashDocContent(r.title, r.content)
    const needsReindex =
      !r.embeddedAt ||
      (r.embeddingModel != null && r.embeddingModel !== currentModel) ||
      (r.embeddingDims != null && r.embeddingDims !== currentDims) ||
      (r.contentHash != null && r.contentHash !== expectedHash)
    return {
      id: r.id,
      category: (r.category ?? 'genel') as KnowledgeCategory,
      title: r.title,
      content: r.content,
      callDirection: (r.callDirection as 'inbound' | 'outbound' | 'both') || 'both',
      active: r.active ?? true,
      embeddedAt: toIso(r.embeddedAt),
      embeddingModel: r.embeddingModel ?? null,
      embeddingDims: r.embeddingDims ?? null,
      contentHash: r.contentHash ?? null,
      needsReindex,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    }
  })
}

export async function countEmbedded(): Promise<{ total: number; embedded: number; needsReindex: number }> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  const currentModel = getEmbeddingModel()
  const currentDims = getEmbeddingDimensions()
  const result = await db.execute(drizzleSql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(embedding)::int AS embedded,
      COUNT(*) FILTER (
        WHERE embedding IS NULL
           OR (embedding_model IS NOT NULL AND embedding_model <> ${currentModel})
           OR (embedding_dims IS NOT NULL AND embedding_dims <> ${currentDims})
      )::int AS needs_reindex
    FROM knowledge_documents WHERE clinic_id = ${clinicId}
  `)
  const row = (result as unknown as { rows?: Array<{ total: number; embedded: number; needs_reindex: number }> }).rows?.[0]
    ?? (Array.isArray(result) ? (result[0] as { total: number; embedded: number; needs_reindex: number }) : { total: 0, embedded: 0, needs_reindex: 0 })
  return {
    total: Number(row.total ?? 0),
    embedded: Number(row.embedded ?? 0),
    needsReindex: Number(row.needs_reindex ?? 0),
  }
}

export async function createDoc(
  data: Pick<KnowledgeDoc, 'category' | 'title' | 'content' | 'callDirection' | 'active'>,
  embedding: number[],
  meta?: DocEmbeddingMeta,
): Promise<KnowledgeDoc> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  const nowIso = new Date().toISOString()
  const hasEmbedding = embedding.length > 0
  const embeddingModel = meta?.embeddingModel ?? (hasEmbedding ? getEmbeddingModel() : null)
  const embeddingDims = meta?.embeddingDims ?? (hasEmbedding ? embedding.length : null)
  const contentHash = meta?.contentHash ?? hashDocContent(data.title, data.content)

  const insertResult = await db.execute(drizzleSql`
    INSERT INTO knowledge_documents (
      clinic_id, category, title, content, call_direction, active,
      embedding, embedding_model, embedding_dims, content_hash,
      embedded_at, created_at, updated_at
    )
    VALUES (
      ${clinicId},
      ${data.category},
      ${data.title},
      ${data.content},
      ${data.callDirection || 'both'},
      ${data.active},
      ${hasEmbedding ? drizzleSql`${vectorLiteral(embedding)}::vector` : drizzleSql`NULL`},
      ${embeddingModel},
      ${embeddingDims},
      ${contentHash},
      ${hasEmbedding ? nowIso : null},
      ${nowIso},
      ${nowIso}
    )
    RETURNING id, category, title, content, call_direction, active, embedding_model, embedding_dims, content_hash, embedded_at, created_at, updated_at
  `)
  const row = ((insertResult as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (insertResult as unknown as Array<Record<string, unknown>>))[0]
  const docId = row.id as string
  const direction = (row.call_direction as 'inbound' | 'outbound' | 'both') || 'both'

  const chunksToSave = meta?.chunks && meta.chunks.length > 0
    ? meta.chunks
    : hasEmbedding
      ? [{ content: data.content, embedding }]
      : []
  if (chunksToSave.length > 0) {
    await saveDocChunks(docId, direction, chunksToSave, clinicId)
  }

  return {
    id: docId,
    category: (row.category as KnowledgeCategory) ?? 'genel',
    title: row.title as string,
    content: row.content as string,
    callDirection: direction,
    active: row.active as boolean,
    embeddedAt: row.embedded_at ? new Date(row.embedded_at as string).toISOString() : '',
    embeddingModel: (row.embedding_model as string) ?? null,
    embeddingDims: (row.embedding_dims as number) ?? null,
    contentHash: (row.content_hash as string) ?? null,
    needsReindex: false,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export async function updateDoc(
  id: string,
  data: Partial<Pick<KnowledgeDoc, 'category' | 'title' | 'content' | 'callDirection' | 'active'>>,
  newEmbedding?: number[],
  meta?: DocEmbeddingMeta,
): Promise<KnowledgeDoc | null> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  const nowIso = new Date().toISOString()

  const sets: ReturnType<typeof drizzleSql>[] = []
  if (data.category !== undefined) sets.push(drizzleSql`category = ${data.category}`)
  if (data.title !== undefined) sets.push(drizzleSql`title = ${data.title}`)
  if (data.content !== undefined) sets.push(drizzleSql`content = ${data.content}`)
  if (data.callDirection !== undefined) sets.push(drizzleSql`call_direction = ${data.callDirection}`)
  if (data.active !== undefined) sets.push(drizzleSql`active = ${data.active}`)
  if (newEmbedding !== undefined) {
    if (newEmbedding.length > 0) {
      const model = meta?.embeddingModel ?? getEmbeddingModel()
      const dims = meta?.embeddingDims ?? newEmbedding.length
      sets.push(drizzleSql`embedding = ${vectorLiteral(newEmbedding)}::vector`)
      sets.push(drizzleSql`embedding_model = ${model}`)
      sets.push(drizzleSql`embedding_dims = ${dims}`)
      sets.push(drizzleSql`embedded_at = ${nowIso}`)
    } else {
      sets.push(drizzleSql`embedding = NULL`)
      sets.push(drizzleSql`embedded_at = NULL`)
    }
  }
  if (meta?.contentHash !== undefined) {
    sets.push(drizzleSql`content_hash = ${meta.contentHash}`)
  } else if (data.title !== undefined && data.content !== undefined) {
    sets.push(drizzleSql`content_hash = ${hashDocContent(data.title, data.content)}`)
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
    WHERE id = ${id} AND clinic_id = ${clinicId}
    RETURNING id, category, title, content, call_direction, active, embedding_model, embedding_dims, content_hash, embedded_at, created_at, updated_at
  `)
  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))[0]
  if (!row) return null

  const direction = (row.call_direction as 'inbound' | 'outbound' | 'both') || 'both'
  if (meta?.chunks && meta.chunks.length > 0) {
    await saveDocChunks(id, direction, meta.chunks, clinicId)
  } else if (newEmbedding && newEmbedding.length > 0) {
    await saveDocChunks(id, direction, [{ content: row.content as string, embedding: newEmbedding }], clinicId)
  } else if (data.callDirection !== undefined) {
    await db.execute(drizzleSql`
      UPDATE knowledge_doc_chunks
      SET call_direction = ${direction}
      WHERE document_id = ${id} AND clinic_id = ${clinicId}
    `)
  }

  return {
    id: row.id as string,
    category: (row.category as KnowledgeCategory) ?? 'genel',
    title: row.title as string,
    content: row.content as string,
    callDirection: direction,
    active: row.active as boolean,
    embeddedAt: row.embedded_at ? new Date(row.embedded_at as string).toISOString() : '',
    embeddingModel: (row.embedding_model as string) ?? null,
    embeddingDims: (row.embedding_dims as number) ?? null,
    contentHash: (row.content_hash as string) ?? null,
    needsReindex: false,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export async function deleteDoc(id: string): Promise<boolean> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  try {
    const rows = await db.delete(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.clinicId, clinicId))).returning({ id: knowledgeDocuments.id })
    return rows.length > 0
  } catch {
    return false
  }
}

export async function toggleDoc(id: string): Promise<KnowledgeDoc | null> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  const condition = and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.clinicId, clinicId))
  const [existing] = await db.select({ active: knowledgeDocuments.active }).from(knowledgeDocuments).where(condition)
  if (!existing) return null

  const [doc] = await db
    .update(knowledgeDocuments)
    .set({ active: !existing.active, updatedAt: new Date() })
    .where(condition)
    .returning()

  if (!doc) return null
  return {
    id: doc.id,
    category: doc.category as KnowledgeCategory,
    title: doc.title,
    content: doc.content,
    callDirection: doc.callDirection as any,
    active: doc.active,
    embeddedAt: toIso(doc.embeddedAt),
    embeddingModel: doc.embeddingModel ?? null,
    embeddingDims: doc.embeddingDims ?? null,
    contentHash: doc.contentHash ?? null,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  }
}

export async function updateDocEmbedding(
  id: string,
  embedding: number[],
  meta?: DocEmbeddingMeta & { callDirection?: string },
): Promise<boolean> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  if (embedding.length === 0) return false
  const model = meta?.embeddingModel ?? getEmbeddingModel()
  const dims = meta?.embeddingDims ?? embedding.length
  const contentHash = meta?.contentHash ?? null

  const result = await db.execute(drizzleSql`
    UPDATE knowledge_documents
    SET embedding = ${vectorLiteral(embedding)}::vector,
        embedding_model = ${model},
        embedding_dims = ${dims},
        content_hash = COALESCE(${contentHash}, content_hash),
        embedded_at = now(),
        updated_at = now()
    WHERE id = ${id} AND clinic_id = ${clinicId}
    RETURNING id, content, call_direction
  `)
  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))
  if (rows.length === 0) return false

  const row = rows[0]!
  const direction = meta?.callDirection || (row.call_direction as string) || 'both'
  const chunks = meta?.chunks && meta.chunks.length > 0
    ? meta.chunks
    : [{ content: String(row.content ?? ''), embedding }]
  await saveDocChunks(id, direction, chunks, clinicId)
  return true
}

export interface RankedDoc {
  id: string
  category: string
  title: string
  content: string
  score: number
}

function buildDirectionClause(direction: string = 'inbound', tableAlias?: string) {
  const col = tableAlias ? drizzleSql.raw(`${tableAlias}.call_direction`) : drizzleSql`call_direction`
  const dir = (direction || 'inbound').toLowerCase()
  if (dir === 'both' || dir === 'all') return drizzleSql`true`
  if (dir === 'whatsapp') {
    return drizzleSql`(${col} IN ('both', 'inbound', 'whatsapp'))`
  }
  return drizzleSql`(${col} = 'both' OR ${col} = ${dir})`
}

export async function retrieveTopK(
  queryEmbedding: number[],
  k = 5,
  direction: string = 'inbound',
  options?: { includeCustomerDocs?: boolean; minScore?: number },
): Promise<RankedDoc[]> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  if (queryEmbedding.length === 0) return []
  const minScore = options?.minScore !== undefined ? options.minScore : 0.45
  const vecStr = vectorLiteral(queryEmbedding)

  const docDirClause = buildDirectionClause(direction, 'd')
  const docPiiClause = options?.includeCustomerDocs ? drizzleSql`true` : drizzleSql`d.category <> 'musteri'`

  const rows = await db.transaction(async tx => {
    await tx.execute(drizzleSql`SET LOCAL hnsw.ef_search = 100`).catch(() => {})
    try {
      await tx.execute(drizzleSql`SAVEPOINT sp_hnsw_scan`)
      await tx.execute(drizzleSql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`)
      await tx.execute(drizzleSql`RELEASE SAVEPOINT sp_hnsw_scan`)
    } catch {
      await tx.execute(drizzleSql`ROLLBACK TO SAVEPOINT sp_hnsw_scan`).catch(() => {})
    }

    const candidateLimit = Math.max(k * 4, 20)
    const res = await tx.execute(drizzleSql`
      WITH chunk_matches AS (
        SELECT
          d.id,
          d.category,
          d.title,
          c.content AS snippet,
          c.chunk_index,
          1 - (c.embedding <=> ${vecStr}::vector) AS score
        FROM knowledge_doc_chunks c
        INNER JOIN knowledge_documents d ON d.id = c.document_id
        WHERE c.clinic_id = ${clinicId}
          AND d.clinic_id = ${clinicId}
          AND d.active = true
          AND c.embedding IS NOT NULL
          AND ${docPiiClause}
          AND ${docDirClause}
        ORDER BY c.embedding <=> ${vecStr}::vector
        LIMIT ${candidateLimit}
      ),
      doc_matches AS (
        SELECT
          d.id,
          d.category,
          d.title,
          d.content AS snippet,
          0 AS chunk_index,
          1 - (d.embedding <=> ${vecStr}::vector) AS score
        FROM knowledge_documents d
        WHERE d.clinic_id = ${clinicId}
          AND d.active = true
          AND d.embedding IS NOT NULL
          AND ${docPiiClause}
          AND ${docDirClause}
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_doc_chunks c
            WHERE c.document_id = d.id AND c.clinic_id = ${clinicId}
          )
        ORDER BY d.embedding <=> ${vecStr}::vector
        LIMIT ${candidateLimit}
      ),
      combined AS (
        SELECT * FROM chunk_matches
        UNION ALL
        SELECT * FROM doc_matches
      )
      SELECT id, category, title, snippet, chunk_index, score
      FROM combined
      WHERE score >= ${minScore}
      ORDER BY score DESC
      LIMIT ${candidateLimit}
    `)
    return ((res as unknown as { rows?: Array<Record<string, unknown>> }).rows
      ?? (res as unknown as Array<Record<string, unknown>>))
  })

  // Group matched chunks by document (up to 2 highest-scoring chunks per doc, ordered by chunk_index)
  const grouped = new Map<string, {
    id: string
    category: string
    title: string
    bestScore: number
    chunks: Array<{ index: number; text: string; score: number }>
  }>()

  for (const r of rows) {
    const id = r.id as string
    const score = Number(r.score)
    if (!Number.isFinite(score) || score < minScore) continue
    const snippet = String(r.snippet ?? '').trim()
    const chunkIndex = Number(r.chunk_index ?? 0)

    let entry = grouped.get(id)
    if (!entry) {
      entry = {
        id,
        category: r.category as string,
        title: r.title as string,
        bestScore: score,
        chunks: [],
      }
      grouped.set(id, entry)
    } else if (score > entry.bestScore) {
      entry.bestScore = score
    }

    if (entry.chunks.length < 2 && !entry.chunks.some(c => c.index === chunkIndex)) {
      entry.chunks.push({ index: chunkIndex, text: snippet, score })
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, k)
    .map(entry => {
      const orderedText = entry.chunks
        .sort((a, b) => a.index - b.index)
        .map(c => c.text)
        .join('\n\n')
      return {
        id: entry.id,
        category: entry.category,
        title: entry.title,
        content: orderedText,
        score: entry.bestScore,
      }
    })
}

export function normalizeTurkishSearchWords(query: string): string[] {
  return query
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !TURKISH_STOPWORDS.has(w))
    .slice(0, 8)
}

/**
 * Fallback text-based search — embedding başarısız olduğunda veya sonuç
 * bulunamadığında kullanılır. Türkçe normalizasyon, stopword filtresi,
 * dinamik eşleşme skoru ve pg_trgm benzerliği kullanır.
 */
export async function searchByText(
  query: string,
  k = 5,
  direction: string = 'inbound',
  options?: { includeCustomerDocs?: boolean },
): Promise<RankedDoc[]> {
  await ensureKnowledgeSchema()
  const clinicId = requireClinicId()
  const normalizedFull = query.trim().toLocaleLowerCase('tr-TR')
  const words = normalizeTurkishSearchWords(query)
  if (words.length === 0) return []

  const directionClause = buildDirectionClause(direction)
  const piiClause = options?.includeCustomerDocs ? drizzleSql`true` : drizzleSql`category <> 'musteri'`

  const matchConditions = words.map(
    w => drizzleSql`(LOWER(title) LIKE ${'%' + w + '%'} OR LOWER(content) LIKE ${'%' + w + '%'})`
  )
  const whereWords = drizzleSql.join(matchConditions, drizzleSql` OR `)

  // Her eşleşen kelime için dinamik skor katkısı (title eşleşmesi daha yüksek ağırlıklı)
  const scoreTerms = words.map(
    w => drizzleSql`(CASE WHEN LOWER(title) LIKE ${'%' + w + '%'} THEN 0.35 ELSE 0 END + CASE WHEN LOWER(content) LIKE ${'%' + w + '%'} THEN 0.20 ELSE 0 END)`
  )
  const wordScoreExpr = drizzleSql.join(scoreTerms, drizzleSql` + `)

  let rows: Array<Record<string, unknown>> = []
  try {
    // Try with pg_trgm similarity boost first
    const result = await db.execute(drizzleSql`
      SELECT
        id,
        category,
        title,
        content,
        LEAST(
          0.95,
          0.30 + ((${wordScoreExpr}) / ${Math.max(1, words.length)}) + GREATEST(similarity(LOWER(title), ${normalizedFull}), word_similarity(${normalizedFull}, LOWER(content))) * 0.35
        ) AS score
      FROM knowledge_documents
      WHERE clinic_id = ${clinicId} AND active = true
        AND ${piiClause}
        AND ${directionClause}
        AND ((${whereWords}) OR word_similarity(${normalizedFull}, LOWER(title || ' ' || content)) > 0.25)
      ORDER BY score DESC
      LIMIT ${k}
    `)
    rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
      ?? (result as unknown as Array<Record<string, unknown>>))
  } catch {
    // Fallback without pg_trgm if extension is unavailable
    const result = await db.execute(drizzleSql`
      SELECT
        id,
        category,
        title,
        content,
        LEAST(0.90, 0.35 + ((${wordScoreExpr}) / ${Math.max(1, words.length)})) AS score
      FROM knowledge_documents
      WHERE clinic_id = ${clinicId} AND active = true
        AND ${piiClause}
        AND ${directionClause}
        AND (${whereWords})
      ORDER BY score DESC
      LIMIT ${k}
    `)
    rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
      ?? (result as unknown as Array<Record<string, unknown>>))
  }

  return rows.map(r => ({
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    content: r.content as string,
    score: Number(r.score),
  }))
}

/**
 * Önce `patients` tablosunda telefon numarasına göre hastayı arar;
 * bulunamazsa geriye uyumluluk için bilgi tabanındaki "musteri" kategorisine bakar.
 */
export async function findCustomerDocByPhone(phone: string): Promise<{ name: string; content: string } | null> {
  const clinicId = requireClinicId()
  const normalized = phone.replace(/\D/g, '')
  if (normalized.length < 10) return null
  const last10 = normalized.slice(-10)

  try {
    const { findPatientByPhone } = await import('./dental')
    const patient = await findPatientByPhone(phone, clinicId)
    if (patient && patient.name) {
      return {
        name: patient.name,
        content: `Telefon: ${patient.phone || phone}`,
      }
    }
  } catch {
    // Fallback to knowledge_documents if patients query fails
  }

  const result = await db.execute(drizzleSql`
    SELECT title, content
    FROM knowledge_documents
    WHERE clinic_id = ${clinicId} AND active = true
      AND category = 'musteri'
      AND content LIKE ${'%' + last10 + '%'}
    LIMIT 1
  `)
  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))
  if (rows.length === 0) return null

  const row = rows[0]
  const title = row.title as string
  const name = title.replace(/^müşteri\s*[-–—:]\s*/i, '').trim()
  return { name, content: row.content as string }
}
