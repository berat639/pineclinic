import { Elysia } from 'elysia'
import {
  chunkDocumentText,
  computeContentHash,
  embedTextsBatch,
  getEmbeddingDimensions,
  getEmbeddingModel,
} from '../rag'
import { listCategories } from '../db/repositories/categories'
import {
  countEmbedded,
  createDoc,
  deleteDoc,
  listDocs,
  toggleDoc,
  updateDoc,
  updateDocEmbedding,
  type DocChunkInput,
  type KnowledgeDoc,
} from '../db/repositories/knowledge'
import { extractTextFromFile, UnsupportedFileError } from '../services/knowledge-extract'
import { currentClinicId, requireClinicId, runWithTenantContext } from '../tenancy/context'

export interface ReindexJobState {
  status: 'idle' | 'running' | 'completed' | 'failed'
  total: number
  processed: number
  success: number
  failed: number
  skipped: number
  startedAt?: string
  finishedAt?: string
  error?: string
}

const reindexJobs = new Map<string, ReindexJobState>()

function normalizeDirection(raw: unknown): 'inbound' | 'outbound' | 'both' {
  const val = String(raw ?? '').trim().toLowerCase()
  if (val === 'inbound' || val === 'outbound' || val === 'both') return val
  return 'both'
}

async function resolveValidCategory(rawCategory: unknown): Promise<string> {
  const slug = String(rawCategory ?? '').trim().toLowerCase()
  if (!slug) return 'genel'
  try {
    const categories = await listCategories()
    if (categories.some(c => c.slug.toLowerCase() === slug)) return slug
  } catch {
    // Fallback if categories lookup fails
  }
  return 'genel'
}

async function embedDocumentWithChunks(title: string, content: string): Promise<{
  primaryEmbedding: number[]
  chunks: DocChunkInput[]
  embeddingModel: string
  embeddingDims: number
  contentHash: string
}> {
  const textChunks = chunkDocumentText(content)
  const items = (textChunks.length > 0 ? textChunks : [content]).map(chunk => ({
    text: chunk,
    title,
    taskType: 'RETRIEVAL_DOCUMENT' as const,
  }))
  const vectors = await embedTextsBatch(items, 4)
  const chunks: DocChunkInput[] = items.map((item, idx) => ({
    content: item.text,
    embedding: vectors[idx] ?? [],
  })).filter(c => c.embedding.length > 0)

  const primaryEmbedding = chunks[0]?.embedding ?? []
  if (primaryEmbedding.length === 0) {
    throw new Error('Embedding API boş vektör döndürdü')
  }
  return {
    primaryEmbedding,
    chunks,
    embeddingModel: getEmbeddingModel(),
    embeddingDims: getEmbeddingDimensions(),
    contentHash: computeContentHash(title, content),
  }
}

async function handleList() {
  const docs = await listDocs()
  const { total, embedded, needsReindex } = await countEmbedded()
  const clinicId = currentClinicId()
  const reindexJob = clinicId ? reindexJobs.get(clinicId) ?? null : null
  return {
    docs,
    totalEmbedded: embedded,
    total,
    needsReindex,
    embeddingModel: getEmbeddingModel(),
    embeddingDims: getEmbeddingDimensions(),
    reindexJob,
  }
}

async function handleUpload({ request, set }: { request: Request; set: { status?: number | string } }) {
  let content: string
  let title: string
  try {
    const form = await request.formData()
    const name = String(form.get('title') ?? form.get('name') ?? '').trim()
    const category = await resolveValidCategory(form.get('category'))
    const callDirection = normalizeDirection(form.get('callDirection'))
    const activeRaw = form.get('active')
    const active = activeRaw === null ? true : String(activeRaw) !== 'false'
    const textField = form.get('text')
    const fileEntry = form.get('file')

    if (fileEntry instanceof File && fileEntry.size > 0) {
      title = (name || fileEntry.name.replace(/\.[^.]+$/, '') || 'Yüklenen belge').slice(0, 200)
      try {
        content = await extractTextFromFile(fileEntry)
      } catch (err) {
        if (err instanceof UnsupportedFileError) {
          set.status = 400
          return { error: err.message }
        }
        console.error('[RAG] knowledge/upload parse error:', err)
        set.status = 400
        return { error: 'Dosya içeriği okunamadı. Dosyanın bozuk olmadığından emin olun.' }
      }
    } else if (typeof textField === 'string' && textField.trim()) {
      title = (name || 'Yüklenen metin').slice(0, 200)
      content = textField.trim()
    } else {
      set.status = 400
      return { error: 'Dosya veya metin gerekli' }
    }

    if (content.trim().length < 10) {
      set.status = 400
      return { error: 'İçerik en az 10 karakter olmalı' }
    }

    let embeddedData: Awaited<ReturnType<typeof embedDocumentWithChunks>>
    try {
      embeddedData = await embedDocumentWithChunks(title, content)
    } catch (e) {
      console.error('[RAG] knowledge/upload embedding:', e)
      set.status = 502
      return { error: 'Gömme (embedding) başarısız — yapay zeka API anahtarı ayarını kontrol edin.' }
    }

    const doc = await createDoc(
      { category, title, content, callDirection, active },
      embeddedData.primaryEmbedding,
      {
        embeddingModel: embeddedData.embeddingModel,
        embeddingDims: embeddedData.embeddingDims,
        contentHash: embeddedData.contentHash,
        chunks: embeddedData.chunks,
      },
    )
    return {
      success: true,
      id: doc.id,
      name: doc.title,
      category: doc.category,
      chunksCount: embeddedData.chunks.length,
      doc,
      message: 'Belge indekslendi',
    }
  } catch (e) {
    console.error('[Knowledge] upload:', e)
    set.status = 500
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

async function handleCreate({ body, set }: { body: unknown; set: { status?: number | string } }) {
  const { category, title, content, callDirection, active } = (body ?? {}) as Record<string, any>
  if (!category || !title || !content) {
    set.status = 400
    return { error: 'category, title ve content zorunludur' }
  }
  try {
    const cleanTitle = String(title).trim()
    const cleanContent = String(content)
    let embeddedData: Awaited<ReturnType<typeof embedDocumentWithChunks>>
    try {
      embeddedData = await embedDocumentWithChunks(cleanTitle, cleanContent)
    } catch (e) {
      console.error('[RAG] Embedding hatası:', e)
      set.status = 502
      return { error: 'Belge kaydedilmedi: gömme (embedding) oluşturulamadı. Yapay zeka embedding ayarını ve bağlantıyı kontrol edin.' }
    }
    const validCategory = await resolveValidCategory(category)
    const doc = await createDoc(
      {
        category: validCategory,
        title: cleanTitle,
        content: cleanContent,
        callDirection: normalizeDirection(callDirection),
        active: active !== false,
      },
      embeddedData.primaryEmbedding,
      {
        embeddingModel: embeddedData.embeddingModel,
        embeddingDims: embeddedData.embeddingDims,
        contentHash: embeddedData.contentHash,
        chunks: embeddedData.chunks,
      },
    )
    return { success: true, doc, chunksCount: embeddedData.chunks.length }
  } catch (e) {
    set.status = 500
    return { error: String(e) }
  }
}

async function handleUpdate({ params, body, set }: { params: Record<string, string>; body: unknown; set: { status?: number | string } }) {
  const { category, title, content, callDirection, active } = (body ?? {}) as Record<string, any>
  let embeddedData: Awaited<ReturnType<typeof embedDocumentWithChunks>> | undefined
  if (content) {
    try {
      const cleanTitle = title !== undefined ? String(title).trim() : ''
      embeddedData = await embedDocumentWithChunks(cleanTitle, String(content))
    } catch (e) {
      console.error('[RAG] Re-embed hatası:', e)
      set.status = 502
      return { error: 'Belge güncellenmedi: gömme (embedding) oluşturulamadı. Yapay zeka embedding ayarını ve bağlantıyı kontrol edin.' }
    }
  }
  const validCategory = category !== undefined ? await resolveValidCategory(category) : undefined
  const doc = await updateDoc(
    params.id,
    {
      category: validCategory,
      title: title !== undefined ? String(title).trim() : undefined,
      content: content !== undefined ? String(content) : undefined,
      callDirection: callDirection !== undefined ? normalizeDirection(callDirection) : undefined,
      active,
    },
    embeddedData?.primaryEmbedding,
    embeddedData
      ? {
          embeddingModel: embeddedData.embeddingModel,
          embeddingDims: embeddedData.embeddingDims,
          contentHash: embeddedData.contentHash,
          chunks: embeddedData.chunks,
        }
      : undefined,
  )
  if (!doc) {
    set.status = 404
    return { error: 'Belge bulunamadı' }
  }
  return { success: true, doc }
}

async function handleDelete({ params, set }: { params: Record<string, string>; set: { status?: number | string } }) {
  const deleted = await deleteDoc(params.id)
  if (!deleted) {
    set.status = 404
    return { error: 'Belge bulunamadı' }
  }
  return { success: true, id: params.id }
}

async function handleToggle({ params, set }: { params: Record<string, string>; set: { status?: number | string } }) {
  const doc = await toggleDoc(params.id)
  if (!doc) {
    set.status = 404
    return { error: 'Belge bulunamadı' }
  }
  return { success: true, doc }
}

async function runClinicReindex(clinicId: string, docs: KnowledgeDoc[], force: boolean): Promise<ReindexJobState> {
  const currentModel = getEmbeddingModel()
  const currentDims = getEmbeddingDimensions()
  const state: ReindexJobState = {
    status: 'running',
    total: docs.length,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
  }
  reindexJobs.set(clinicId, state)

  const batchSize = 3
  try {
    for (let i = 0; i < docs.length; i += batchSize) {
      const slice = docs.slice(i, i + batchSize)
      await Promise.all(
        slice.map(async doc => {
          try {
            const expectedHash = computeContentHash(doc.title, doc.content)
            const unchanged =
              !force &&
              Boolean(doc.embeddedAt) &&
              doc.embeddingModel === currentModel &&
              doc.embeddingDims === currentDims &&
              doc.contentHash === expectedHash

            if (unchanged) {
              state.skipped++
              state.success++
              state.processed++
              return
            }

            const embeddedData = await embedDocumentWithChunks(doc.title, doc.content)
            await updateDocEmbedding(doc.id, embeddedData.primaryEmbedding, {
              embeddingModel: embeddedData.embeddingModel,
              embeddingDims: embeddedData.embeddingDims,
              contentHash: embeddedData.contentHash,
              chunks: embeddedData.chunks,
              callDirection: doc.callDirection,
            })
            state.success++
            state.processed++
            console.log(`[RAG] Reindex: "${doc.title}" (${embeddedData.chunks.length} parça) ✓`)
          } catch (e) {
            state.failed++
            state.processed++
            console.error(`[RAG] "${doc.title}":`, e)
          }
        }),
      )
    }
    state.status = 'completed'
    state.finishedAt = new Date().toISOString()
  } catch (err) {
    state.status = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    state.finishedAt = new Date().toISOString()
  }
  return state
}

async function handleReindex({ body }: { body?: unknown }) {
  const clinicId = requireClinicId()
  const existing = reindexJobs.get(clinicId)
  if (existing && existing.status === 'running') {
    return {
      success: true,
      background: true,
      status: existing,
      results: {
        success: existing.success,
        failed: existing.failed,
        skipped: existing.skipped,
        total: existing.total,
      },
    }
  }

  const opts = (body ?? {}) as { force?: boolean; async?: boolean }
  const force = opts.force === true
  const docs = await listDocs()

  if (opts.async === true || docs.length > 25) {
    const initialState: ReindexJobState = {
      status: 'running',
      total: docs.length,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startedAt: new Date().toISOString(),
    }
    reindexJobs.set(clinicId, initialState)
    void runWithTenantContext({ clinicId, hostname: `reindex:${clinicId}` }, () =>
      runClinicReindex(clinicId, docs, force),
    )
    return {
      success: true,
      background: true,
      status: initialState,
      results: { success: 0, failed: 0, skipped: 0, total: docs.length },
    }
  }

  const finalState = await runClinicReindex(clinicId, docs, force)
  return {
    success: true,
    background: false,
    status: finalState,
    results: {
      success: finalState.success,
      failed: finalState.failed,
      skipped: finalState.skipped,
      total: finalState.total,
    },
  }
}

async function handleReindexStatus() {
  const clinicId = requireClinicId()
  const { total, embedded, needsReindex } = await countEmbedded()
  const job = reindexJobs.get(clinicId) ?? {
    status: 'idle' as const,
    total,
    processed: embedded,
    success: embedded,
    failed: 0,
    skipped: 0,
  }
  return {
    ...job,
    totalDocs: total,
    totalEmbedded: embedded,
    needsReindex,
    embeddingModel: getEmbeddingModel(),
    embeddingDims: getEmbeddingDimensions(),
  }
}

function createKnowledgeGroup<const P extends string>(prefix: P) {
  return new Elysia({ prefix })
    .get('/', handleList)
    .post('/upload', handleUpload)
    .post('/', handleCreate)
    .put('/:id', handleUpdate)
    .delete('/:id', handleDelete)
    .patch('/:id/toggle', handleToggle)
    .get('/reindex/status', handleReindexStatus)
    .post('/reindex', handleReindex)
    .put('/reindex', handleReindex)
}

export const knowledgePlugin = (app: Elysia<any, any, any, any, any, any, any>) =>
  app
    .use(createKnowledgeGroup('/api/knowledge'))
    .use(createKnowledgeGroup('/api/admin/knowledge')) as typeof app
