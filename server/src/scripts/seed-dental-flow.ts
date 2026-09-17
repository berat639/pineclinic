/**
 * Seeds a default dental conversation flow with branching:
 *   new customer → collect name, phone, date, time → unassigned kontrol randevu
 *   existing customer → select doctor, procedure type, date, time → assigned randevu
 */
import { db } from '../db/client'
import { clinics, conversationFlows } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { FlowNode, FlowEdge } from '../db/repositories/flows'

const nodes: FlowNode[] = [
  { id: 'start', type: 'START', position: { x: 400, y: 0 }, data: { label: 'Karşılama' } },
  { id: 'field_telefon', type: 'FIELD', position: { x: 400, y: 100 }, data: { fieldName: 'telefon', description: 'Telefon numaranızı öğrenebilir miyim?', required: true, fieldType: 'text' } },
  { id: 'cond_kayitli', type: 'CONDITION', position: { x: 400, y: 220 }, data: { label: 'Kayıtlı mı?', conditionField: 'kayitli', operator: 'equals', conditionValue: 'true' } },
  // Existing customer branch (true)
  { id: 'field_doktor_id', type: 'FIELD', position: { x: 150, y: 360 }, data: { fieldName: 'doktor_id', description: 'Hangi doktora gelmek istersiniz? (doktor_gecmisi listesinden seçin)', required: false, fieldType: 'text' } },
  { id: 'field_islem_turu', type: 'FIELD', position: { x: 150, y: 460 }, data: { fieldName: 'islem_turu', description: 'Hangi işlem için randevu almak istiyorsunuz?', required: false, fieldType: 'text' } },
  { id: 'field_tarih_existing', type: 'FIELD', position: { x: 150, y: 560 }, data: { fieldName: 'tarih', description: 'Hangi tarihe randevu almak istersiniz? (YYYY-MM-DD)', required: true, fieldType: 'date' } },
  { id: 'field_saat_existing', type: 'FIELD', position: { x: 150, y: 660 }, data: { fieldName: 'saat', description: 'Saat kaçı tercih edersiniz? (HH:MM)', required: true, fieldType: 'time' } },
  { id: 'action_existing', type: 'ACTION', position: { x: 150, y: 760 }, data: { action: 'randevuOlustur' } },
  { id: 'end_existing', type: 'END', position: { x: 150, y: 860 }, data: { label: 'Son' } },
  // New customer branch (false)
  { id: 'field_ad_soyad', type: 'FIELD', position: { x: 650, y: 360 }, data: { fieldName: 'ad_soyad', description: 'Adınız ve soyadınız?', required: false, fieldType: 'text' } },
  { id: 'field_tarih_new', type: 'FIELD', position: { x: 650, y: 460 }, data: { fieldName: 'tarih', description: 'Hangi tarihe randevu almak istersiniz? (YYYY-MM-DD)', required: true, fieldType: 'date' } },
  { id: 'field_saat_new', type: 'FIELD', position: { x: 650, y: 560 }, data: { fieldName: 'saat', description: 'Saat kaçı tercih edersiniz? (HH:MM)', required: true, fieldType: 'time' } },
  { id: 'action_new', type: 'ACTION', position: { x: 650, y: 660 }, data: { action: 'randevuOlustur' } },
  { id: 'end_new', type: 'END', position: { x: 650, y: 760 }, data: { label: 'Son' } },
]

const edges: FlowEdge[] = [
  { id: 'e1', source: 'start', target: 'field_telefon' },
  { id: 'e2', source: 'field_telefon', target: 'cond_kayitli' },
  // True branch (existing customer)
  { id: 'e3', source: 'cond_kayitli', target: 'field_doktor_id', sourceHandle: 'true' },
  { id: 'e4', source: 'field_doktor_id', target: 'field_islem_turu' },
  { id: 'e5', source: 'field_islem_turu', target: 'field_tarih_existing' },
  { id: 'e6', source: 'field_tarih_existing', target: 'field_saat_existing' },
  { id: 'e7', source: 'field_saat_existing', target: 'action_existing' },
  { id: 'e8', source: 'action_existing', target: 'end_existing' },
  // False branch (new customer)
  { id: 'e9', source: 'cond_kayitli', target: 'field_ad_soyad', sourceHandle: 'false' },
  { id: 'e10', source: 'field_ad_soyad', target: 'field_tarih_new' },
  { id: 'e11', source: 'field_tarih_new', target: 'field_saat_new' },
  { id: 'e12', source: 'field_saat_new', target: 'action_new' },
  { id: 'e13', source: 'action_new', target: 'end_new' },
]

async function main() {
  const [clinic] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.isActive, true)).limit(1)
  if (!clinic) throw new Error('Aktif klinik bulunamadı')
  // Deactivate existing flows
  await db.update(conversationFlows).set({ isActive: false }).where(eq(conversationFlows.clinicId, clinic.id))

  // Insert new branching flow
  const [row] = await db.insert(conversationFlows).values({
    clinicId: clinic.id,
    name: 'dental-branching',
    nodes: nodes as unknown as Record<string, unknown>[],
    edges: edges as unknown as Record<string, unknown>[],
    isActive: true,
  }).returning()

  console.log(`✓ Dental branching flow created: ${row.id}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
