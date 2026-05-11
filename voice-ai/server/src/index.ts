import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { randomUUID } from 'crypto'
import { createReadStream, writeFileSync } from 'fs'
import { resolve } from 'path'
import { createAI, createLiveSession } from './gemini'
import {
  readAppointments,
  deleteAppointment,
  listRecordings,
  saveRecording,
  deleteRecording,
  RECORDINGS_DIR,
  // Knowledge
  listDocs,
  createDoc,
  updateDoc,
  deleteDoc,
  toggleDoc,
  readKnowledge,
  updateDocEmbedding,
} from './db'
import { embedText, retrieveTopK, buildRagPrompt, PRE_WARM_QUERY } from './rag'

const PORT = Number(process.env.PORT) || 3005
const ai = createAI()

// ── Session tracking ──────────────────────────────────────────────────────────

interface SessionInfo {
  session: Awaited<ReturnType<typeof createLiveSession>>
  startedAt: Date
  audioChunks: Buffer[]      // AI audio — 24kHz 16-bit mono
  userAudioChunks: Buffer[]  // User mic — 16kHz 16-bit mono
  shortId: string
}

const sessions = new Map<string, SessionInfo>()

// ── SSE: Admin real-time notifications ───────────────────────────────────────
type SseClient = { id: string; send: (data: string) => void }
const sseClients = new Set<SseClient>()

function notifyAdmins(event: string, payload: unknown) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) {
    try { client.send(data) } catch { sseClients.delete(client) }
  }
}

// ── WAV header helper ─────────────────────────────────────────────────────────
// Gemini Live outputs PCM 24kHz 16-bit mono

// Upsample 16kHz PCM → 24kHz using linear interpolation (ratio 3/2)
function upsample16to24(buf: Buffer): Buffer {
  const inSamples = buf.length / 2
  const outSamples = Math.ceil(inSamples * 24000 / 16000)
  const out = Buffer.alloc(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    const srcF = i * 16000 / 24000
    const srcI = Math.floor(srcF)
    const frac = srcF - srcI
    const s0 = buf.readInt16LE(Math.min(srcI, inSamples - 1) * 2)
    const s1 = buf.readInt16LE(Math.min(srcI + 1, inSamples - 1) * 2)
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2)
  }
  return out
}

// Build stereo WAV: left = user (upsampled to 24kHz), right = AI (24kHz)
function buildStereoWav(aiChunks: Buffer[], userChunks: Buffer[]): Buffer {
  const aiPcm = Buffer.concat(aiChunks)
  const userPcmRaw = Buffer.concat(userChunks)
  const userPcm = upsample16to24(userPcmRaw)

  const sampleRate = 24000
  const numChannels = 2
  const bitsPerSample = 16
  const nSamples = Math.max(aiPcm.length, userPcm.length) / 2
  const dataSize = nSamples * numChannels * 2
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)            // PCM
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  const data = Buffer.alloc(dataSize, 0)
  for (let i = 0; i < nSamples; i++) {
    // Left channel: user
    const u = i * 2 < userPcm.length ? userPcm.readInt16LE(i * 2) : 0
    // Right channel: AI
    const a = i * 2 < aiPcm.length ? aiPcm.readInt16LE(i * 2) : 0
    data.writeInt16LE(u, i * 4)      // L
    data.writeInt16LE(a, i * 4 + 2) // R
  }

  return Buffer.concat([header, data])
}

// ── Elysia app ────────────────────────────────────────────────────────────────

const app = new Elysia()
  .use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001'] }))

  // ── REST: Appointments ──────────────────────────────────────────────────────
  .get('/api/appointments', () => readAppointments())

  .delete('/api/appointments/:id', ({ params, set }) => {
    const deleted = deleteAppointment(params.id)
    if (!deleted) {
      set.status = 404
      return { error: 'Appointment not found' }
    }
    return { success: true, id: params.id }
  })

  // ── REST: Stats ─────────────────────────────────────────────────────────────
  .get('/api/stats', () => ({
    activeSessions: sessions.size,
    totalAppointments: readAppointments().length,
    totalRecordings: listRecordings().length,
  }))

  // ── SSE: Admin real-time event stream ───────────────────────────────────────
  .get('/api/events', ({ set }) => {
    const clientId = randomUUID().slice(0, 8)
    set.headers['Content-Type'] = 'text/event-stream'
    set.headers['Cache-Control'] = 'no-cache'
    set.headers['Connection'] = 'keep-alive'
    set.headers['Access-Control-Allow-Origin'] = '*'

    return new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const send = (data: string) => controller.enqueue(enc.encode(data))
        const client: SseClient = { id: clientId, send }
        sseClients.add(client)
        send(`: connected ${clientId}\n\n`)
        const hb = setInterval(() => {
          try { send(`: ping\n\n`) } catch { clearInterval(hb); sseClients.delete(client) }
        }, 20000)
        // Store hb on the client so cancel() can clear it
        ;(client as SseClient & { hb: ReturnType<typeof setInterval> }).hb = hb
      },
      cancel() {
        // Called by the runtime when the client disconnects
        for (const c of sseClients) {
          if (c.id === clientId) {
            clearInterval((c as SseClient & { hb: ReturnType<typeof setInterval> }).hb)
            sseClients.delete(c)
            break
          }
        }
      },
    })
  })

  // ── REST: Recordings ────────────────────────────────────────────────────────
  .get('/api/recordings', () => listRecordings())

  .get('/api/recordings/:filename', ({ params, set }) => {
    try {
      const filePath = resolve(RECORDINGS_DIR, params.filename)
      // Güvenlik: path traversal engelinde sadece RECORDINGS_DIR altına izin ver
      if (!filePath.startsWith(RECORDINGS_DIR)) {
        set.status = 403
        return 'Forbidden'
      }
      set.headers['Content-Type'] = 'audio/wav'
      set.headers['Content-Disposition'] = `inline; filename="${params.filename}"`
      return createReadStream(filePath)
    } catch {
      set.status = 404
      return 'Not found'
    }
  })

  .delete('/api/recordings/:id', ({ params, set }) => {
    const deleted = deleteRecording(params.id)
    if (!deleted) {
      set.status = 404
      return { error: 'Recording not found' }
    }
    return { success: true, id: params.id }
  })

  // ── REST: Knowledge (RAG) ────────────────────────────────────────────────────

  // GET /api/knowledge — tüm belgeler (embedding hariç)
  .get('/api/knowledge', () => {
    const docs = listDocs()
    const store = readKnowledge()
    const totalEmbedded = store.docs.filter(d => d.embedding.length > 0).length
    return { docs, totalEmbedded, total: docs.length }
  })

  // POST /api/knowledge — yeni belge ekle (otomatik embed)
  .post('/api/knowledge', async ({ body, set }) => {
    const { category, title, content, active } = body as {
      category: string; title: string; content: string; active?: boolean
    }
    if (!category || !title || !content) {
      set.status = 400
      return { error: 'category, title ve content zorunludur' }
    }
    try {
      let embedding: number[] = []
      try {
        embedding = await embedText(content)
      } catch (e) {
        console.error('[RAG] Embedding hatası (belge kaydedilecek ama embedding boş):', e)
      }
      const doc = createDoc(
        {
          category: category as any,
          title,
          content,
          active: active !== false,
        },
        embedding,
      )
      const { embedding: _e, ...docWithoutEmbedding } = doc
      return { success: true, doc: docWithoutEmbedding }
    } catch (e) {
      set.status = 500
      return { error: String(e) }
    }
  })

  // PUT /api/knowledge/:id — güncelle (içerik değiştiyse re-embed)
  .put('/api/knowledge/:id', async ({ params, body, set }) => {
    const { category, title, content, active } = body as {
      category?: string; title?: string; content?: string; active?: boolean
    }

    // İçerik değiştiyse yeniden embed et
    let newEmbedding: number[] | undefined = undefined
    if (content) {
      try {
        newEmbedding = await embedText(content)
      } catch (e) {
        console.error('[RAG] Re-embedding hatası:', e)
        newEmbedding = []
      }
    }

    const doc = updateDoc(
      params.id,
      { category: category as any, title, content, active },
      newEmbedding,
    )
    if (!doc) {
      set.status = 404
      return { error: 'Belge bulunamadı' }
    }
    const { embedding: _e, ...docWithoutEmbedding } = doc
    return { success: true, doc: docWithoutEmbedding }
  })

  // DELETE /api/knowledge/:id
  .delete('/api/knowledge/:id', ({ params, set }) => {
    const deleted = deleteDoc(params.id)
    if (!deleted) {
      set.status = 404
      return { error: 'Belge bulunamadı' }
    }
    return { success: true, id: params.id }
  })

  // PATCH /api/knowledge/:id/toggle — aktif <-> pasif
  .patch('/api/knowledge/:id/toggle', ({ params, set }) => {
    const doc = toggleDoc(params.id)
    if (!doc) {
      set.status = 404
      return { error: 'Belge bulunamadı' }
    }
    const { embedding: _e, ...docWithoutEmbedding } = doc
    return { success: true, doc: docWithoutEmbedding }
  })

  // POST /api/knowledge/reindex — tüm belgeleri yeniden embed et
  .post('/api/knowledge/reindex', async ({ set }) => {
    const store = readKnowledge()
    const results = { success: 0, failed: 0, total: store.docs.length }
    for (const doc of store.docs) {
      try {
        const embedding = await embedText(doc.content)
        updateDocEmbedding(doc.id, embedding)
        results.success++
        console.log(`[RAG] Reindex: "${doc.title}" ✓`)
      } catch (e) {
        results.failed++
        console.error(`[RAG] Reindex hatası: "${doc.title}":`, e)
      }
    }
    return { success: true, results }
  })

  // ── WebSocket: Voice streaming ──────────────────────────────────────────────
  .ws('/ws', {
    async open(ws) {
      const shortId = randomUUID().slice(0, 8)
      console.log(`[${shortId}] Client connected`)

      const info: SessionInfo = {
        session: null as unknown as SessionInfo['session'],
        startedAt: new Date(),
        audioChunks: [],
        userAudioChunks: [],
        shortId,
      }

      try {
        // ── RAG: Pre-warm — retrieve top-5 relevant docs before session starts
        let ragContext: string | undefined
        try {
          const topDocs = await retrieveTopK(PRE_WARM_QUERY, 5)
          if (topDocs.length > 0) {
            ragContext = buildRagPrompt(topDocs)
            console.log(`[${shortId}] RAG: ${topDocs.length} belge yüklendi → ${topDocs.map(d => d.title).join(', ')}`)
          } else {
            console.log(`[${shortId}] RAG: Bilgi bankası boş veya embedding yok`)
          }
        } catch (e) {
          console.error(`[${shortId}] RAG pre-warm hatası:`, e)
        }

        const session = await createLiveSession(ai, {
          onReady: () => {
            console.log(`[${shortId}] Gemini Live ready`)
            ws.send(JSON.stringify({ type: 'ready' }))
          },
          onAudio: (pcm) => {
            // Stream to client + accumulate for recording
            ws.send(pcm)
            info.audioChunks.push(pcm)
          },
          onTranscript: (role, text) => {
            ws.send(JSON.stringify({ type: 'transcript', role, text }))
          },
          onInterrupted: () => {
            ws.send(JSON.stringify({ type: 'interrupted' }))
          },
          onTurnComplete: () => {
            ws.send(JSON.stringify({ type: 'turn_complete' }))
          },
          onError: (e) => console.error(`[${shortId}] Gemini error:`, e),
          onClose: () => {
            console.log(`[${shortId}] Gemini session closed`)
            sessions.delete(shortId)
            notifyAdmins('session_end', { id: shortId, activeSessions: sessions.size })
          },
          onAppointment: (appointment) => {
            notifyAdmins('new_appointment', appointment)
            console.log(`[${shortId}] 📅 Yeni randevu bildirimi gönderildi:`, appointment.customerName)
          },
        }, ragContext)

        info.session = session
        ;(ws.data as Record<string, unknown>).sessionId = shortId
        sessions.set(shortId, info)
        notifyAdmins('session_start', { id: shortId, activeSessions: sessions.size })

        // Auto-greet
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: '[KULLANICI BAĞLANDI]' }] }],
          turnComplete: true,
        })
      } catch (err) {
        console.error(`[${shortId}] Failed to start session:`, err)
        ws.send(JSON.stringify({ type: 'error', message: 'Session failed to start' }))
        ws.close()
      }
    },

    message(ws, message) {
      const shortId = (ws.data as Record<string, unknown>).sessionId as string
      const info = sessions.get(shortId)
      if (!info) return

      if (message instanceof Buffer || message instanceof Uint8Array) {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message)
        // Stream to Gemini
        info.session.sendRealtimeInput({
          media: { data: buf.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
        })
        // Accumulate for recording
        info.userAudioChunks.push(buf)
      }
    },

    close(ws) {
      const shortId = (ws.data as Record<string, unknown>).sessionId as string
      const info = sessions.get(shortId)
      if (info) {
        // Save stereo WAV if any audio captured
        const hasAudio = info.audioChunks.length > 0 || info.userAudioChunks.length > 0
        if (hasAudio) {
          const endedAt = new Date()
          const durationMs = endedAt.getTime() - info.startedAt.getTime()
          const ts = info.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const filename = `session_${shortId}_${ts}.wav`
          const filePath = resolve(RECORDINGS_DIR, filename)

          try {
            const wavBuf = buildStereoWav(info.audioChunks, info.userAudioChunks)
            writeFileSync(filePath, wavBuf)
            saveRecording({
              id: shortId,
              filename,
              startedAt: info.startedAt.toISOString(),
              endedAt: endedAt.toISOString(),
              durationMs,
              sizeBytes: wavBuf.length,
            })
            console.log(`[${shortId}] Stereo recording saved: ${filename} (${(wavBuf.length / 1024).toFixed(1)} KB)`)
          } catch (e) {
            console.error(`[${shortId}] Failed to save recording:`, e)
          }
        }

        try { info.session?.close() } catch {}
        sessions.delete(shortId)
      }
      console.log(`[${shortId}] Disconnected`)
    },
  })

  .listen(PORT, () => {
    console.log(`\n Voice AI Server`)
    console.log(`   http://localhost:${PORT}`)
    console.log(`   ws://localhost:${PORT}/ws`)
    console.log(`   Model: ${process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'}`)
    console.log(`   RAG: text-embedding-004 (Semantic)\n`)
  })

export type App = typeof app
