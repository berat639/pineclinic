import { resolve } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { recordings } from '../schema'

export const RECORDINGS_DIR = resolve(import.meta.dir, '../../../../data/recordings')

export interface RecordingMeta {
  id: string
  filename: string
  startedAt: string
  endedAt: string
  durationMs: number
  sizeBytes: number
  sessionId?: string | null
}

function rowToMeta(r: typeof recordings.$inferSelect): RecordingMeta {
  return {
    id: r.id,
    filename: r.filename,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt.toISOString(),
    durationMs: Number(r.durationMs),
    sizeBytes: Number(r.sizeBytes),
    sessionId: r.sessionId,
  }
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const rows = await db.select().from(recordings).orderBy(desc(recordings.startedAt))
  return rows.map(rowToMeta)
}

export async function saveRecording(meta: {
  id?: string
  sessionId?: string | null
  filename: string
  startedAt: string
  endedAt: string
  durationMs: number
  sizeBytes: number
}): Promise<RecordingMeta> {
  const started = new Date(meta.startedAt)
  const ended = new Date(meta.endedAt)
  // Upsert by id if provided (UUID); otherwise insert new
  if (meta.id) {
    const existing = await db.select().from(recordings).where(eq(recordings.id, meta.id)).limit(1)
    if (existing.length > 0) {
      const [updated] = await db
        .update(recordings)
        .set({
          sessionId: meta.sessionId ?? null,
          filename: meta.filename,
          startedAt: started,
          endedAt: ended,
          durationMs: meta.durationMs,
          sizeBytes: meta.sizeBytes,
        })
        .where(eq(recordings.id, meta.id))
        .returning()
      return rowToMeta(updated)
    }
  }
  const [inserted] = await db
    .insert(recordings)
    .values({
      ...(meta.id ? { id: meta.id } : {}),
      sessionId: meta.sessionId ?? null,
      filename: meta.filename,
      startedAt: started,
      endedAt: ended,
      durationMs: meta.durationMs,
      sizeBytes: meta.sizeBytes,
    })
    .returning()
  return rowToMeta(inserted)
}

export async function deleteRecording(id: string): Promise<boolean> {
  const rows = await db
    .delete(recordings)
    .where(eq(recordings.id, id))
    .returning({ filename: recordings.filename })
  if (rows.length === 0) return false
  const filePath = resolve(RECORDINGS_DIR, rows[0].filename)
  if (existsSync(filePath)) {
    try { unlinkSync(filePath) } catch {}
  }
  return true
}
