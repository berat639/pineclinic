/**
 * Seed dental clinic demo data — run once to populate calendar.
 * Usage: bun --env-file ../.env run src/scripts/seed-dental.ts
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('DATABASE_URL gerekli'); process.exit(1) }
const sql = postgres(DATABASE_URL, { max: 1 })

async function seed() {
  console.log('[Seed] Dental demo verileri yükleniyor...')

  // Get doctors
  const doctors = await sql`SELECT id, name FROM doctors ORDER BY name`
  if (doctors.length === 0) {
    console.error('[Seed] Önce migration çalıştırın (doktorlar yok)')
    process.exit(1)
  }
  const [d1, d2, d3] = doctors

  // Create patients
  const patientData = [
    { name: 'FERDİ ASLAN', phone: '05321234567', balance: 150000 },
    { name: 'AYŞE YILMAZ', phone: '05339876543', balance: 85000 },
    { name: 'MEHMET KAYA', phone: '05551112233', balance: 200000 },
    { name: 'ZEYNEP DEMİR', phone: '05424445566', balance: 60000 },
    { name: 'ALİ ÖZTÜRK', phone: '05367778899', balance: 120000 },
    { name: 'FATMA ÇELİK', phone: '05443332211', balance: 95000 },
  ]

  const patientIds: string[] = []
  for (const p of patientData) {
    const [row] = await sql`
      INSERT INTO patients (name, phone, balance)
      VALUES (${p.name}, ${p.phone}, ${p.balance})
      RETURNING id
    `
    patientIds.push(row.id)
  }
  console.log(`[Seed] ${patientIds.length} hasta oluşturuldu`)

  // Create dental appointments for today
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10)

  const appointmentData = [
    { patient: 0, doctor: d1.id, title: 'FERDİ ASLAN - Dolgu & Ölçü', start: '09:00', end: '10:00', type: 'dolgu', status: 'confirmed' },
    { patient: 1, doctor: d1.id, title: 'AYŞE YILMAZ - Kanal Tedavisi', start: '10:30', end: '11:30', type: 'kanal', status: 'scheduled' },
    { patient: 2, doctor: d2.id, title: 'MEHMET KAYA - İmplant Kontrol', start: '09:30', end: '10:30', type: 'implant', status: 'confirmed' },
    { patient: 3, doctor: d2.id, title: 'ZEYNEP DEMİR - Diş Çekimi', start: '11:00', end: '11:30', type: 'cekim', status: 'scheduled' },
    { patient: 4, doctor: d3.id, title: 'ALİ ÖZTÜRK - Zirkonyum Kaplama', start: '09:00', end: '10:30', type: 'kaplama', status: 'in_progress' },
    { patient: 5, doctor: d3.id, title: 'FATMA ÇELİK - Bleaching', start: '11:00', end: '12:00', type: 'beyazlatma', status: 'scheduled' },
    { patient: 0, doctor: d1.id, title: 'FERDİ ASLAN - Kontrol', start: '14:00', end: '14:30', type: 'kontrol', status: 'scheduled' },
    { patient: 2, doctor: d2.id, title: 'MEHMET KAYA - Protez Ölçü', start: '14:00', end: '15:00', type: 'protez', status: 'confirmed' },
    { patient: 4, doctor: d3.id, title: 'ALİ ÖZTÜRK - Veneer Yapıştırma', start: '14:30', end: '16:00', type: 'veneer', status: 'scheduled' },
  ]

  for (const a of appointmentData) {
    const startTime = new Date(`${dateStr}T${a.start}:00+03:00`)
    const endTime = new Date(`${dateStr}T${a.end}:00+03:00`)
    await sql`
      INSERT INTO dental_appointments (patient_id, doctor_id, title, start_time, end_time, type, status)
      VALUES (${patientIds[a.patient]}, ${a.doctor}, ${a.title}, ${startTime}, ${endTime}, ${a.type}, ${a.status})
    `
  }
  console.log(`[Seed] ${appointmentData.length} randevu oluşturuldu`)

  // Treatment plans for FERDİ ASLAN
  const ferdiId = patientIds[0]
  const treatments = [
    { proc: '4 İmplant', cost: 60000, status: 'planned' },
    { proc: '11 Üye Zirkon', cost: 55000, status: 'planned' },
    { proc: '4 ED', cost: 20000, status: 'completed' },
    { proc: 'Detertraj', cost: 5000, status: 'completed' },
    { proc: 'Bleaching', cost: 10000, status: 'planned' },
  ]
  for (const t of treatments) {
    await sql`
      INSERT INTO treatment_plans (patient_id, procedure_name, cost, status)
      VALUES (${ferdiId}, ${t.proc}, ${t.cost}, ${t.status})
    `
  }

  // Payments for FERDİ ASLAN
  const paymentsList = [
    { date: '05.02.2026', amount: 30000, method: 'Nakit Alındı' },
    { date: '20.02.2026', amount: 25000, method: 'Kredi Kartı' },
    { date: '10.03.2026', amount: 20000, method: 'Havale' },
  ]
  for (const p of paymentsList) {
    await sql`
      INSERT INTO patient_payments (patient_id, date, amount, method)
      VALUES (${ferdiId}, ${p.date}, ${p.amount}, ${p.method})
    `
  }

  // Completed works for FERDİ ASLAN
  const worksList = [
    { doctor: d1.id, date: '05.02.2026', desc: '3 implant yerleştirildi (alt çene)' },
    { doctor: d2.id, date: '20.02.2026', desc: 'Geçici protez takıldı, ölçü alındı' },
    { doctor: d1.id, date: '10.03.2026', desc: 'Detertraj + kontrol yapıldı' },
    { doctor: d3.id, date: '25.03.2026', desc: '4 ED (estetik dolgu) tamamlandı' },
  ]
  for (const w of worksList) {
    await sql`
      INSERT INTO completed_works (patient_id, doctor_id, date, description)
      VALUES (${ferdiId}, ${w.doctor}, ${w.date}, ${w.desc})
    `
  }

  // Also add some data for MEHMET KAYA
  const mehmetId = patientIds[2]
  await sql`INSERT INTO treatment_plans (patient_id, procedure_name, cost, status) VALUES (${mehmetId}, '6 İmplant', ${90000}, 'planned')`
  await sql`INSERT INTO treatment_plans (patient_id, procedure_name, cost, status) VALUES (${mehmetId}, 'Protez (tam çene)', ${80000}, 'planned')`
  await sql`INSERT INTO treatment_plans (patient_id, procedure_name, cost, status) VALUES (${mehmetId}, 'Bone Graft', ${30000}, 'completed')`
  await sql`INSERT INTO patient_payments (patient_id, date, amount, method) VALUES (${mehmetId}, '15.01.2026', ${50000}, 'Nakit Alındı')`
  await sql`INSERT INTO patient_payments (patient_id, date, amount, method) VALUES (${mehmetId}, '01.03.2026', ${40000}, 'Kredi Kartı')`
  await sql`INSERT INTO completed_works (patient_id, doctor_id, date, description) VALUES (${mehmetId}, ${d2.id}, '15.01.2026', 'Bone graft operasyonu yapıldı')`
  await sql`INSERT INTO completed_works (patient_id, doctor_id, date, description) VALUES (${mehmetId}, ${d2.id}, '01.03.2026', '2 implant yerleştirildi (üst çene)')`

  console.log('[Seed] Tedavi planları, ödemeler ve yapılan işler eklendi')
  console.log('[Seed] Tamamlandı!')
  await sql.end()
}

seed().catch((err) => {
  console.error('[Seed] Hata:', err)
  process.exit(1)
})
