import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { randomUUID } from 'crypto'
import { createAI, createLiveSession } from './gemini'
import { readAppointments } from './db'

const PORT = Number(process.env.PORT) || 3001
const ai = createAI()

// Track active Gemini sessions per WebSocket connection
const sessions = new Map<string, Awaited<ReturnType<typeof createLiveSession>>>()

const app = new Elysia()
  .use(cors({ origin: 'http://localhost:3000' }))

  // REST: list appointments
  .get('/api/appointments', () => readAppointments())

  // WebSocket: real-time voice streaming
  .ws('/ws', {
    async open(ws) {
      const id = randomUUID().slice(0, 8)
      console.log(`[${id}] Client connected`)

      try {
        const session = await createLiveSession(ai, {
          onReady: () => {
            console.log(`[${id}] Gemini Live ready`)
            ws.send(JSON.stringify({ type: 'ready' }))
          },
          onAudio: (pcm) => {
            // Stream PCM 24kHz binary immediately — no buffering
            ws.send(pcm)
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
          onError: (e) => console.error(`[${id}] Gemini error:`, e),
          onClose: () => {
            console.log(`[${id}] Gemini session closed`)
            sessions.delete(id)
          },
        })

        // Store session keyed by a stable ID attached to ws
        ;(ws.data as Record<string, unknown>).sessionId = id
        sessions.set(id, session)

        // Auto-greet: trigger Gemini to speak first without waiting for user
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: '[KULLANICI BAĞLANDI]' }] }],
          turnComplete: true,
        })
      } catch (err) {
        console.error(`[${id}] Failed to start session:`, err)
        ws.send(JSON.stringify({ type: 'error', message: 'Session failed to start' }))
        ws.close()
      }
    },

    message(ws, message) {
      const id = (ws.data as Record<string, unknown>).sessionId as string
      const session = sessions.get(id)
      if (!session) return

      // Binary = PCM 16kHz audio from client microphone
      if (message instanceof Buffer || message instanceof Uint8Array) {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message)
        session.sendRealtimeInput({
          media: {
            data: buf.toString('base64'),
            mimeType: 'audio/pcm;rate=16000',
          },
        })
      }
    },

    close(ws) {
      const id = (ws.data as Record<string, unknown>).sessionId as string
      const session = sessions.get(id)
      try { session?.close() } catch {}
      sessions.delete(id)
      console.log(`[${id}] Disconnected`)
    },
  })

  .listen(PORT, () => {
    console.log(`\n Voice AI Server`)
    console.log(`   http://localhost:${PORT}`)
    console.log(`   ws://localhost:${PORT}/ws`)
    console.log(`   Model: ${process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'}\n`)
  })

export type App = typeof app
