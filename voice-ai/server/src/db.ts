import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'

const DATA_FILE           = resolve(import.meta.dir, '../../data/appointments.json')
const RECORDINGS_DIR      = resolve(import.meta.dir, '../../data/recordings')
const RECORDINGS_META_FILE = resolve(import.meta.dir, '../../data/recordings.json')
const KNOWLEDGE_FILE      = resolve(import.meta.dir, '../../data/knowledge.json')

// ── Appointments ──────────────────────────────────────────────────────────────

export interface Appointment {
  id: string
  createdAt: string
  customerName: string
  phone: string
  type: 'service' | 'test_drive' | 'gallery_visit' | 'other'
  vehicleInfo?: string
  issueOrRequest?: string
  date: string
  time: string
  discountRequested?: boolean   // Müşteri indirim talep etti mi
  notes?: string                // Ek notlar (indirim talebi vb.)
}

export function readAppointments(): Appointment[] {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return []
  }
}

export function createAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Appointment {
  const appointments = readAppointments()
  const appointment: Appointment = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...data,
  }
  appointments.push(appointment)
  writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2))
  return appointment
}

export function deleteAppointment(id: string): boolean {
  const appointments = readAppointments()
  const index = appointments.findIndex(a => a.id === id)
  if (index === -1) return false
  appointments.splice(index, 1)
  writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2))
  return true
}

// ── Recordings ────────────────────────────────────────────────────────────────

export interface RecordingMeta {
  id: string           // session short id
  filename: string     // e.g. "session_abc123_20260509T144500.wav"
  startedAt: string
  endedAt: string
  durationMs: number
  sizeBytes: number
}

function readRecordingsMeta(): RecordingMeta[] {
  try {
    return JSON.parse(readFileSync(RECORDINGS_META_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveRecordingsMeta(list: RecordingMeta[]) {
  writeFileSync(RECORDINGS_META_FILE, JSON.stringify(list, null, 2))
}

export function listRecordings(): RecordingMeta[] {
  return readRecordingsMeta().reverse() // newest first
}

export function saveRecording(meta: RecordingMeta) {
  const list = readRecordingsMeta()
  // Deduplicate by id
  const filtered = list.filter(r => r.id !== meta.id)
  filtered.push(meta)
  saveRecordingsMeta(filtered)
}

export function deleteRecording(id: string): boolean {
  const list = readRecordingsMeta()
  const rec = list.find(r => r.id === id)
  if (!rec) return false
  const filtered = list.filter(r => r.id !== id)
  saveRecordingsMeta(filtered)
  // Also delete actual WAV file
  const filePath = resolve(RECORDINGS_DIR, rec.filename)
  if (existsSync(filePath)) {
    try { require('fs').unlinkSync(filePath) } catch {}
  }
  return true
}

// ── Knowledge (RAG) ───────────────────────────────────────────────────────────

export interface KnowledgeDoc {
  id: string
  category: 'genel' | 'servis' | 'galeri' | 'kampanya' | 'sss' | 'arac'
  title: string       // Admin'de görünen başlık
  content: string     // AI'ın okuyacağı metin
  active: boolean     // false → embedding'e dahil edilmez
  embedding: number[] // text-embedding-004 vektörü (768 boyut)
  embeddedAt: string  // Son embedding tarihi
  createdAt: string
  updatedAt: string
}

export interface KnowledgeStore {
  docs: KnowledgeDoc[]
  updatedAt: string
}

export function readKnowledge(): KnowledgeStore {
  try {
    return JSON.parse(readFileSync(KNOWLEDGE_FILE, 'utf-8'))
  } catch {
    return { docs: [], updatedAt: new Date().toISOString() }
  }
}

function saveKnowledge(store: KnowledgeStore) {
  store.updatedAt = new Date().toISOString()
  writeFileSync(KNOWLEDGE_FILE, JSON.stringify(store, null, 2))
}

export function listDocs(): Omit<KnowledgeDoc, 'embedding'>[] {
  const store = readKnowledge()
  // Strip embedding to keep API payload small
  return store.docs.map(({ embedding: _e, ...rest }) => rest)
}

export function createDoc(
  data: Pick<KnowledgeDoc, 'category' | 'title' | 'content' | 'active'>,
  embedding: number[],
): KnowledgeDoc {
  const store = readKnowledge()
  const now = new Date().toISOString()
  const doc: KnowledgeDoc = {
    id: randomUUID(),
    ...data,
    embedding,
    embeddedAt: embedding.length > 0 ? now : '',
    createdAt: now,
    updatedAt: now,
  }
  store.docs.push(doc)
  saveKnowledge(store)
  return doc
}

export function updateDoc(
  id: string,
  data: Partial<Pick<KnowledgeDoc, 'category' | 'title' | 'content' | 'active'>>,
  newEmbedding?: number[],
): KnowledgeDoc | null {
  const store = readKnowledge()
  const idx = store.docs.findIndex(d => d.id === id)
  if (idx === -1) return null
  const now = new Date().toISOString()
  const doc = store.docs[idx]
  store.docs[idx] = {
    ...doc,
    ...data,
    ...(newEmbedding !== undefined
      ? { embedding: newEmbedding, embeddedAt: now }
      : {}),
    updatedAt: now,
  }
  saveKnowledge(store)
  return store.docs[idx]
}

export function deleteDoc(id: string): boolean {
  const store = readKnowledge()
  const idx = store.docs.findIndex(d => d.id === id)
  if (idx === -1) return false
  store.docs.splice(idx, 1)
  saveKnowledge(store)
  return true
}

export function toggleDoc(id: string): KnowledgeDoc | null {
  const store = readKnowledge()
  const idx = store.docs.findIndex(d => d.id === id)
  if (idx === -1) return null
  store.docs[idx].active = !store.docs[idx].active
  store.docs[idx].updatedAt = new Date().toISOString()
  saveKnowledge(store)
  return store.docs[idx]
}

export function updateDocEmbedding(id: string, embedding: number[]): boolean {
  const store = readKnowledge()
  const idx = store.docs.findIndex(d => d.id === id)
  if (idx === -1) return false
  store.docs[idx].embedding = embedding
  store.docs[idx].embeddedAt = new Date().toISOString()
  store.docs[idx].updatedAt = new Date().toISOString()
  saveKnowledge(store)
  return true
}

export { RECORDINGS_DIR }
