import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db/client'
import {
  appointmentTreatments,
  clinicDomains,
  clinics,
  dentalAppointments,
  patients,
  treatmentPlans,
  users,
} from '../db/schema'
import { ensureTreatmentPlanningSchema } from '../db/treatment-planning-schema'
import { ensureAiAppointmentReviewSchema } from '../db/repositories/dental'
import {
  getNotificationPolicy,
  type NotificationChannelKey,
} from '../db/repositories/settings'
import { enqueueWhatsAppNotification, patientPhoneMatches } from '../db/repositories/whatsapp'
import { activeConfig, decrypt, getRow } from '../integrations/managed/store'
import type { Config } from '../integrations/managed/model'
import { normalizePhone } from '../integrations/whatsapp'
import { broadcastSSE } from '../events'
import { runWithTenantContext } from '../tenancy/context'
import { sendEmail } from './email'
import { sendSMS } from './netgsm'
import { notifyDoctorUser, notifyRole } from './notification'
import { hasPatientConsent } from './patient-consent'
import { TreatmentPlanError } from './treatment-planning'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export type AppointmentNotificationKind =
  | 'appointment_created'
  | 'appointment_rescheduled'
  | 'appointment_reminder_24h'

export type PatientResponseAction = 'confirm' | 'postpone' | 'cancel'

/**
 * Returns the patient's allowed notification channels sorted strictly by the
 * clinic manager's configured priority order in Integrations/Settings.
 */
export async function resolveOrderedPatientChannels(
  clinicId: string,
  patientId: string,
  preferredSubset?: NotificationChannelKey[] | null,
): Promise<NotificationChannelKey[]> {
  const policy = await getNotificationPolicy(clinicId)
  const subset = preferredSubset && preferredSubset.length > 0 ? new Set(preferredSubset) : null
  const ordered: NotificationChannelKey[] = []

  for (const channel of policy.channelPriority) {
    if (!policy.enabledChannels[channel]) continue
    if (subset && !subset.has(channel)) continue
    const consented = await hasPatientConsent(clinicId, patientId, channel)
    if (consented) ordered.push(channel)
  }
  return ordered
}

/**
 * If quiet hours (e.g. 21:00 - 09:00) are enabled, shifts a timestamp that
 * falls inside quiet hours to the end of quiet hours (e.g. 09:00) in Istanbul.
 */
export function adjustForQuietHours(
  date: Date,
  policy: { quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string },
): Date {
  if (!policy.quietHoursEnabled) return date
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const hh = Number(map.hour || 0)
  const mm = Number(map.minute || 0)
  const currentMins = hh * 60 + mm

  const [startH, startM] = policy.quietHoursStart.split(':').map(Number)
  const [endH, endM] = policy.quietHoursEnd.split(':').map(Number)
  const startMins = (startH || 21) * 60 + (startM || 0)
  const endMins = (endH || 9) * 60 + (endM || 0)

  const inQuietHours = startMins > endMins
    ? (currentMins >= startMins || currentMins < endMins)
    : (currentMins >= startMins && currentMins < endMins)

  if (!inQuietHours) return date

  const ymd = `${map.year}-${map.month}-${map.day}`
  const targetSameDay = new Date(`${ymd}T${policy.quietHoursEnd}:00+03:00`)
  if (currentMins >= startMins && startMins > endMins) {
    return new Date(targetSameDay.getTime() + 24 * 60 * 60 * 1000)
  }
  return targetSameDay
}

async function resolveClinicHostname(clinicId: string): Promise<string> {
  const rows = await db
    .select({ hostname: clinicDomains.hostname })
    .from(clinicDomains)
    .where(and(eq(clinicDomains.clinicId, clinicId), eq(clinicDomains.isActive, true)))
    .orderBy(
      sql`(${clinicDomains.hostname} NOT IN ('localhost', '127.0.0.1')) DESC`,
      desc(clinicDomains.isPrimary),
    )
    .limit(1)
  const host = rows[0]?.hostname || (process.env.DEFAULT_CLINIC_HOSTS || 'pineclinic.thinpine.com').split(',')[0]?.trim() || 'pineclinic.thinpine.com'
  return host
}

function buildAppointmentLink(hostname: string, token: string): string {
  const cleanHost = hostname.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] || 'pineclinic.thinpine.com'
  const protocol = cleanHost.startsWith('localhost') || cleanHost.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${cleanHost}/appointment/${token}`
}

/**
 * Schedules or updates an appointment notification job (instant + 24h confirmation).
 */
export async function scheduleAppointmentNotification(params: {
  clinicId: string
  appointmentId: string
  kind: 'appointment_created' | 'appointment_rescheduled'
}) {
  try {
    await ensureTreatmentPlanningSchema()
    await ensureAiAppointmentReviewSchema()

    const [appt] = await db
      .select()
      .from(dentalAppointments)
      .where(and(eq(dentalAppointments.id, params.appointmentId), eq(dentalAppointments.clinicId, params.clinicId)))
      .limit(1)

    if (!appt || !appt.patientId || !appt.isActive) return
    if (['cancelled', 'completed', 'no_show', 'pending_review'].includes(appt.status)) return
    if (appt.startTime.getTime() <= Date.now()) return

    const policy = await getNotificationPolicy(params.clinicId)
    const channels = await resolveOrderedPatientChannels(params.clinicId, appt.patientId)
    if (!channels.length) return

    // Reuse existing token for this appointment if one already exists
    const existingTokenRow = await db.execute(sql`
      SELECT token_plain, token_hash
      FROM appointment_notification_jobs
      WHERE clinic_id = ${params.clinicId}
        AND appointment_id = ${params.appointmentId}
        AND token_plain IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `)
    const existingToken = (existingTokenRow[0] as { token_plain?: string; token_hash?: string } | undefined)?.token_plain
    const tokenPlain = existingToken || randomBytes(32).toString('base64url')
    const tokenHash = existingToken ? hashToken(existingToken) : hashToken(tokenPlain)

    const debounceMs = Math.max(5_000, policy.instantDebounceMinutes * 60_000)
    const instantAttemptAt = new Date(Date.now() + debounceMs)

    if (policy.instantAppointmentNotify) {
      const dedupeKey = `appt_instant:${params.appointmentId}`
      // Only attach unique token_hash to one row per token; if existingToken was reused, generate a fresh token for the new row
      const rowTokenPlain = randomBytes(32).toString('base64url')
      const rowTokenHash = hashToken(rowTokenPlain)
      await db.execute(sql`
        INSERT INTO appointment_notification_jobs (
          clinic_id, patient_id, appointment_id, kind, status, step_index,
          channels, token_hash, token_plain, next_attempt_at, dedupe_key, payload, updated_at
        )
        VALUES (
          ${params.clinicId}, ${appt.patientId}, ${params.appointmentId}, ${params.kind},
          'pending', 0, ${JSON.stringify(channels)}::jsonb, ${rowTokenHash}, ${rowTokenPlain},
          ${instantAttemptAt.toISOString()}, ${dedupeKey},
          ${JSON.stringify({ startTime: appt.startTime.toISOString(), endTime: appt.endTime.toISOString() })}::jsonb,
          NOW()
        )
        ON CONFLICT (clinic_id, dedupe_key) DO UPDATE SET
          kind = EXCLUDED.kind,
          status = 'pending',
          step_index = 0,
          channels = EXCLUDED.channels,
          next_attempt_at = EXCLUDED.next_attempt_at,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `)
    }

    // Cancel older 24h confirmation jobs for previous timestamps of this appointment
    await db.execute(sql`
      UPDATE appointment_notification_jobs
      SET status = 'cancelled', updated_at = NOW()
      WHERE clinic_id = ${params.clinicId}
        AND appointment_id = ${params.appointmentId}
        AND kind = 'appointment_reminder_24h'
        AND status IN ('pending', 'waiting_response')
    `)

    // Schedule 24h confirmation escalation chain if appointment is at least 2 hours away
    const msUntilStart = appt.startTime.getTime() - Date.now()
    if (msUntilStart > 2 * 60 * 60 * 1000) {
      const leadMs = policy.reminderLeadHours * 60 * 60 * 1000
      const rawReminderAt = new Date(Math.max(Date.now() + 60_000, appt.startTime.getTime() - leadMs))
      const reminderAt = adjustForQuietHours(rawReminderAt, policy)
      if (reminderAt.getTime() < appt.startTime.getTime() - 30 * 60 * 1000) {
        const confirmTokenPlain = randomBytes(32).toString('base64url')
        const confirmTokenHash = hashToken(confirmTokenPlain)
        const confirmDedupeKey = `appt_confirm_24h:${params.appointmentId}:${appt.startTime.toISOString()}`
        await db.execute(sql`
          INSERT INTO appointment_notification_jobs (
            clinic_id, patient_id, appointment_id, kind, status, step_index,
            channels, token_hash, token_plain, next_attempt_at, dedupe_key, payload, updated_at
          )
          VALUES (
            ${params.clinicId}, ${appt.patientId}, ${params.appointmentId}, 'appointment_reminder_24h',
            'pending', 0, ${JSON.stringify(channels)}::jsonb, ${confirmTokenHash}, ${confirmTokenPlain},
            ${reminderAt.toISOString()}, ${confirmDedupeKey},
            ${JSON.stringify({ startTime: appt.startTime.toISOString(), endTime: appt.endTime.toISOString() })}::jsonb,
            NOW()
          )
          ON CONFLICT (clinic_id, dedupe_key) DO UPDATE SET
            status = 'pending',
            step_index = 0,
            channels = EXCLUDED.channels,
            next_attempt_at = EXCLUDED.next_attempt_at,
            updated_at = NOW()
        `)
      }
    }
  } catch (err) {
    console.error('[AppointmentNotifications] schedule error:', err)
  }
}

export async function cancelAppointmentNotifications(clinicId: string, appointmentId: string) {
  try {
    await ensureTreatmentPlanningSchema()
    await db.execute(sql`
      UPDATE appointment_notification_jobs
      SET status = 'cancelled', updated_at = NOW()
      WHERE clinic_id = ${clinicId}
        AND appointment_id = ${appointmentId}
        AND status IN ('pending', 'waiting_response')
    `)
  } catch (err) {
    console.error('[AppointmentNotifications] cancel error:', err)
  }
}

/**
 * Sends a single message over the specified channel. Returns true if sent/queued/initiated.
 */
export async function deliverSingleChannelNotification(params: {
  clinic: typeof clinics.$inferSelect
  patient: typeof patients.$inferSelect
  channel: NotificationChannelKey
  subject: string
  message: string
  externalKey: string
}): Promise<boolean> {
  const { clinic, patient, channel, subject, message, externalKey } = params
  if (!await hasPatientConsent(clinic.id, patient.id, channel)) return false

  if (channel === 'whatsapp') {
    if (!clinic.whatsappEnabled || !patient.phone) return false
    await enqueueWhatsAppNotification(
      clinic,
      patient.phone,
      `${message}\n\nWhatsApp bildirimlerini kapatmak için DUR yazabilirsiniz.`,
      externalKey,
      patient.id,
    )
    return true
  }

  if (channel === 'sms') {
    if (!patient.phone) return false
    let config = await activeConfig(clinic.id, 'sms')
    if (!config) {
      const row = await getRow(clinic.id, 'sms')
      if (row?.draft) config = decrypt(row.draft as Config)
    }
    const usercode = config?.username || clinic.netgsmUsercode
    const password = config?.password || clinic.netgsmPassword
    const senderId = config?.senderId || clinic.smsSenderId
    if (!usercode || !password || !senderId) return false
    const res = await sendSMS({ usercode, password, senderId, phone: normalizePhone(patient.phone), message })
    return Boolean(res.success)
  }

  if (channel === 'email') {
    if (!patient.email) return false
    const config = await activeConfig(clinic.id, 'smtp')
    if (!config?.host || !config.port || !config.username || !config.password) return false
    await runWithTenantContext({ clinicId: clinic.id, hostname: 'notification' }, () =>
      sendEmail({ clinicId: clinic.id, to: patient.email!, subject, text: message }),
    )
    return true
  }

  if (channel === 'assistant_call') {
    if (!patient.phone || process.env.TELEPHONY_ENABLED === '0') return false
    const config = await activeConfig(clinic.id, 'phone')
    if (!config?.callerId) return false
    const matches = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.clinicId, clinic.id), patientPhoneMatches(patient.phone)))
      .limit(2)
    if (matches.length !== 1 || matches[0].id !== patient.id) return false
    const { initiateOutboundCall } = await import('./asterisk-ami')
    const result = await initiateOutboundCall(patient.phone, clinic.id)
    return Boolean(result.success)
  }

  return false
}

async function formatAppointmentMessage(params: {
  clinic: typeof clinics.$inferSelect
  patient: typeof patients.$inferSelect
  appointment: typeof dentalAppointments.$inferSelect
  kind: AppointmentNotificationKind
  tokenPlain: string | null
}): Promise<{ subject: string; message: string }> {
  const { clinic, patient, appointment, kind, tokenPlain } = params
  const dateStr = appointment.startTime.toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
  const timeStr = appointment.startTime.toLocaleTimeString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  })

  let doctorName = ''
  if (appointment.doctorId) {
    const [doc] = await db.select({ name: users.name }).from(users).where(eq(users.id, appointment.doctorId)).limit(1)
    if (doc?.name) doctorName = doc.name
  }

  const linked = await db
    .select({ procedureName: treatmentPlans.procedureName, toothNumber: treatmentPlans.toothNumber })
    .from(appointmentTreatments)
    .innerJoin(treatmentPlans, eq(appointmentTreatments.treatmentPlanId, treatmentPlans.id))
    .where(and(eq(appointmentTreatments.appointmentId, appointment.id), ne(treatmentPlans.status, 'cancelled')))

  const proceduresSummary = linked.length > 0
    ? linked.map(item => item.toothNumber && /^[1-4][1-8]$/.test(item.toothNumber) ? `#${item.toothNumber} ${item.procedureName}` : item.procedureName).join(', ')
    : appointment.title

  const hostname = await resolveClinicHostname(clinic.id)
  const link = tokenPlain ? buildAppointmentLink(hostname, tokenPlain) : ''
  const doctorPart = doctorName ? ` (${doctorName})` : ''

  if (kind === 'appointment_created') {
    return {
      subject: `${clinic.name} - Randevu Bilgilendirmesi`,
      message: `Sayın ${patient.name}, ${clinic.name} kliniğimizde ${dateStr} saat ${timeStr}${doctorPart} için randevunuz oluşturulmuştur (${proceduresSummary}).${link ? `\n\nRandevu durumunuzu onaylamak veya gelemeyecekseniz bildirmek için: ${link}` : ''}`,
    }
  }

  if (kind === 'appointment_rescheduled') {
    return {
      subject: `${clinic.name} - Randevu Saati Güncellendi`,
      message: `Sayın ${patient.name}, ${clinic.name} kliniğimizdeki randevunuz ${dateStr} saat ${timeStr}${doctorPart} olarak güncellenmiştir (${proceduresSummary}).${link ? `\n\nRandevu durumunuzu onaylamak veya gelemeyecekseniz bildirmek için: ${link}` : ''}`,
    }
  }

  return {
    subject: `${clinic.name} - Randevu Teyit Hatırlatması`,
    message: `Sayın ${patient.name}, yarın (${dateStr}) saat ${timeStr}${doctorPart} ${clinic.name} kliniğimizde randevunuz bulunmaktadır.${link ? `\n\nGeleceğinizi onaylamak, erteleme talep etmek veya gelemeyecekseniz bildirmek için lütfen tıklayın: ${link}` : ''}`,
  }
}

/**
 * Processes due appointment notification jobs following the clinic manager's
 * priority order.
 */
export async function processAppointmentNotificationJobs() {
  await ensureTreatmentPlanningSchema()
  await ensureAiAppointmentReviewSchema()

  const dueRows = await db.execute(sql`
    SELECT *
    FROM appointment_notification_jobs
    WHERE status IN ('pending', 'waiting_response')
      AND next_attempt_at <= NOW()
    ORDER BY next_attempt_at ASC
    LIMIT 50
  `)

  for (const raw of dueRows as Array<Record<string, any>>) {
    const jobId = String(raw.id)
    const clinicId = String(raw.clinic_id)
    const patientId = String(raw.patient_id)
    const appointmentId = raw.appointment_id ? String(raw.appointment_id) : null
    const kind = String(raw.kind) as AppointmentNotificationKind
    const tokenPlain = raw.token_plain ? String(raw.token_plain) : null

    const claimed = await db.execute(sql`
      UPDATE appointment_notification_jobs
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${jobId} AND status IN ('pending', 'waiting_response')
      RETURNING id
    `)
    if (!claimed.length) continue

    try {
      if (!appointmentId) {
        await db.execute(sql`UPDATE appointment_notification_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ${jobId}`)
        continue
      }

      const [appointment] = await db
        .select()
        .from(dentalAppointments)
        .where(and(eq(dentalAppointments.id, appointmentId), eq(dentalAppointments.clinicId, clinicId)))
        .limit(1)

      if (
        !appointment ||
        !appointment.isActive ||
        ['cancelled', 'completed', 'no_show'].includes(appointment.status) ||
        appointment.startTime.getTime() <= Date.now()
      ) {
        await db.execute(sql`UPDATE appointment_notification_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ${jobId}`)
        continue
      }

      // If this is a 24h confirmation job and the patient already responded or confirmed, stop escalation
      if (
        kind === 'appointment_reminder_24h' &&
        (appointment.status === 'confirmed' || appointment.status === 'postponed' || Boolean(appointment.patientResponseStatus))
      ) {
        await db.execute(sql`UPDATE appointment_notification_jobs SET status = 'completed', updated_at = NOW() WHERE id = ${jobId}`)
        continue
      }

      const [patient] = await db
        .select()
        .from(patients)
        .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
        .limit(1)
      const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)

      if (!patient || !clinic) {
        await db.execute(sql`UPDATE appointment_notification_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ${jobId}`)
        continue
      }

      const policy = await getNotificationPolicy(clinicId)
      const shifted = adjustForQuietHours(new Date(), policy)
      if (shifted.getTime() > Date.now() + 60_000) {
        await db.execute(sql`
          UPDATE appointment_notification_jobs
          SET status = 'pending', next_attempt_at = ${shifted.toISOString()}, updated_at = NOW()
          WHERE id = ${jobId}
        `)
        continue
      }

      const orderedChannels = await resolveOrderedPatientChannels(clinicId, patientId)
      if (!orderedChannels.length) {
        await db.execute(sql`UPDATE appointment_notification_jobs SET status = 'blocked', updated_at = NOW() WHERE id = ${jobId}`)
        continue
      }

      const startStep = Math.max(0, Number(raw.step_index || 0))
      const { subject, message } = await formatAppointmentMessage({
        clinic,
        patient,
        appointment,
        kind,
        tokenPlain,
      })

      let deliveredChannel: NotificationChannelKey | null = null
      let deliveredIdx = startStep

      for (let i = startStep; i < orderedChannels.length; i++) {
        const ch = orderedChannels[i]!
        // For instant notifications, don't trigger an outbound voice call unless it's a confirmation reminder
        if (kind !== 'appointment_reminder_24h' && ch === 'assistant_call' && orderedChannels.length > 1) {
          continue
        }
        try {
          const ok = await deliverSingleChannelNotification({
            clinic,
            patient,
            channel: ch,
            subject,
            message,
            externalKey: `appt_job:${jobId}:${ch}`,
          })
          if (ok) {
            deliveredChannel = ch
            deliveredIdx = i
            break
          }
        } catch (err) {
          console.warn(`[AppointmentNotifications] Channel ${ch} failed for job ${jobId}, falling back to next channel:`, err)
        }
      }

      if (!deliveredChannel) {
        await db.execute(sql`
          UPDATE appointment_notification_jobs
          SET status = 'exhausted', step_index = ${orderedChannels.length}, updated_at = NOW()
          WHERE id = ${jobId}
        `)
        continue
      }

      // One-way notifications finish as soon as the highest-priority working channel succeeds
      if (kind === 'appointment_created' || kind === 'appointment_rescheduled') {
        await db.execute(sql`
          UPDATE appointment_notification_jobs
          SET status = 'completed',
              last_channel = ${deliveredChannel},
              step_index = ${deliveredIdx + 1},
              channels = ${JSON.stringify(orderedChannels)}::jsonb,
              updated_at = NOW()
          WHERE id = ${jobId}
        `)
        continue
      }

      // Escalation job (appointment_reminder_24h): if more channels exist in priority order, wait confirmationWaitHours
      const nextStep = deliveredIdx + 1
      if (nextStep < orderedChannels.length) {
        const waitMs = policy.confirmationWaitHours * 60 * 60 * 1000
        const nextAttempt = adjustForQuietHours(new Date(Date.now() + waitMs), policy)
        if (nextAttempt.getTime() < appointment.startTime.getTime() - 15 * 60 * 1000) {
          await db.execute(sql`
            UPDATE appointment_notification_jobs
            SET status = 'waiting_response',
                last_channel = ${deliveredChannel},
                step_index = ${nextStep},
                channels = ${JSON.stringify(orderedChannels)}::jsonb,
                next_attempt_at = ${nextAttempt.toISOString()},
                updated_at = NOW()
            WHERE id = ${jobId}
          `)
          continue
        }
      }

      await db.execute(sql`
        UPDATE appointment_notification_jobs
        SET status = 'completed',
            last_channel = ${deliveredChannel},
            step_index = ${nextStep},
            channels = ${JSON.stringify(orderedChannels)}::jsonb,
            updated_at = NOW()
        WHERE id = ${jobId}
      `)
    } catch (err) {
      console.error(`[AppointmentNotifications] Error processing job ${jobId}:`, err)
      await db.execute(sql`UPDATE appointment_notification_jobs SET status = 'exhausted', updated_at = NOW() WHERE id = ${jobId}`)
    }
  }
}

/**
 * Applies a patient's response ("Geleceğim" | "Ertelemek İstiyorum" | "Gelmiyorum / İptal")
 * to the appointment and immediately reflects it on the Interactive Calendar via SSE & notifications.
 */
export async function applyPatientAppointmentResponse(input: {
  clinicId: string
  appointmentId: string
  action: PatientResponseAction
  note?: string | null
  preferredDate?: string | null
  channel: 'link' | 'whatsapp' | 'voice'
}) {
  await ensureTreatmentPlanningSchema()
  await ensureAiAppointmentReviewSchema()

  const cleanNote = input.note ? String(input.note).trim().slice(0, 1000) : null
  const cleanPreferredDate = input.preferredDate ? String(input.preferredDate).trim().slice(0, 100) : null

  const [appointment] = await db
    .select()
    .from(dentalAppointments)
    .where(and(eq(dentalAppointments.id, input.appointmentId), eq(dentalAppointments.clinicId, input.clinicId)))
    .limit(1)

  if (!appointment || !appointment.isActive) {
    throw new TreatmentPlanError('Randevu bulunamadı veya aktif değil', 404)
  }

  const [patient] = appointment.patientId
    ? await db.select().from(patients).where(and(eq(patients.id, appointment.patientId), eq(patients.clinicId, input.clinicId))).limit(1)
    : []

  const patientName = patient?.name || appointment.intakePatientName || appointment.title.split(' - ')[0] || 'Hasta'
  const apptDateLabel = appointment.startTime.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const nextStatus =
    input.action === 'confirm'
      ? 'confirmed'
      : input.action === 'postpone'
        ? 'postponed'
        : 'cancelled'

  const nextTimeConfirmed = input.action === 'confirm'
  const responseSummaryPrefix =
    input.action === 'confirm'
      ? `✅ [Hasta Onayladı]`
      : input.action === 'postpone'
        ? `⏳ [Hasta Erteleme Talep Etti${cleanPreferredDate ? ` · Tercih: ${cleanPreferredDate}` : ''}]`
        : `❌ [Hasta Gelemeyeceğini Bildirdi / İptal]`

  const combinedNotes = [
    appointment.notes?.trim() || '',
    `${responseSummaryPrefix}${cleanNote ? `: ${cleanNote}` : ''}`,
  ]
    .filter(Boolean)
    .join('\n')

  const [updated] = await db
    .update(dentalAppointments)
    .set({
      status: nextStatus,
      timeConfirmed: nextTimeConfirmed,
      patientResponseStatus: nextStatus,
      patientResponseNote: cleanNote,
      patientPreferredDate: cleanPreferredDate,
      patientRespondedAt: new Date(),
      patientResponseChannel: input.channel,
      notes: combinedNotes,
      updatedAt: new Date(),
    })
    .where(and(eq(dentalAppointments.id, appointment.id), eq(dentalAppointments.clinicId, input.clinicId)))
    .returning()

  // Stop any pending escalation notifications for this appointment
  await db.execute(sql`
    UPDATE appointment_notification_jobs
    SET status = 'completed',
        patient_response = ${nextStatus},
        patient_response_note = ${cleanNote},
        patient_preferred_date = ${cleanPreferredDate},
        responded_at = NOW(),
        updated_at = NOW()
    WHERE clinic_id = ${input.clinicId}
      AND appointment_id = ${appointment.id}
      AND status IN ('pending', 'waiting_response')
  `)

  // Broadcast live SSE event so CalendarTab updates immediately without page reload
  try {
    broadcastSSE('appointment_updated', {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      patientName,
      status: nextStatus,
      action: input.action,
      note: cleanNote,
      preferredDate: cleanPreferredDate,
      startTime: appointment.startTime.toISOString(),
    })
  } catch {}

  // Send in-app notifications to reception (sekreter), manager (yonetici), and assigned doctor
  try {
    await runWithTenantContext({ clinicId: input.clinicId, hostname: 'appointment-response' }, async () => {
      const title =
        input.action === 'confirm'
          ? `✅ Randevu Onaylandı: ${patientName}`
          : input.action === 'postpone'
            ? `⏳ Erteleme Talebi: ${patientName}`
            : `❌ Hasta Gelemeyecek (İptal): ${patientName}`
      const body =
        input.action === 'confirm'
          ? `${patientName}, ${apptDateLabel} randevusuna geleceğini onayladı.`
          : input.action === 'postpone'
            ? `${patientName}, ${apptDateLabel} randevusu için tarih değişikliği talep etti.${cleanPreferredDate ? ` Tercih: ${cleanPreferredDate}.` : ''}${cleanNote ? ` Not: ${cleanNote}` : ''}`
            : `${patientName}, ${apptDateLabel} randevusuna gelemeyeceğini bildirdi.${cleanNote ? ` Neden: ${cleanNote}` : ''} Saat takvimde boşa çıkarıldı.`

      await notifyRole('sekreter', 'appointment_response', title, body, '/admin')
      await notifyRole('yonetici', 'appointment_response', title, body, '/admin')
      if (appointment.doctorId) {
        await notifyDoctorUser(appointment.doctorId, 'appointment_response', title, body, '/admin')
      }
    })
  } catch (err) {
    console.warn('[AppointmentNotifications] Could not send staff notification:', err)
  }

  return updated
}

/**
 * Public lookup for `/appointment/:token` page.
 */
export async function getPublicAppointmentByToken(token: string) {
  await ensureTreatmentPlanningSchema()
  await ensureAiAppointmentReviewSchema()

  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    throw new TreatmentPlanError('Randevu bağlantısı geçersiz veya süresi dolmuş', 404)
  }

  const tokenHash = hashToken(token)
  const jobs = await db.execute(sql`
    SELECT *
    FROM appointment_notification_jobs
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `)
  const job = jobs[0] as Record<string, any> | undefined
  if (!job || !job.appointment_id) {
    throw new TreatmentPlanError('Randevu bağlantısı bulunamadı veya süresi dolmuş', 404)
  }

  const clinicId = String(job.clinic_id)
  const appointmentId = String(job.appointment_id)

  const [appointment] = await db
    .select()
    .from(dentalAppointments)
    .where(and(eq(dentalAppointments.id, appointmentId), eq(dentalAppointments.clinicId, clinicId)))
    .limit(1)

  if (!appointment || !appointment.isActive) {
    throw new TreatmentPlanError('Randevu bulunamadı', 404)
  }

  const [clinic] = await db.select({ id: clinics.id, name: clinics.name }).from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  const [patient] = appointment.patientId
    ? await db.select({ id: patients.id, name: patients.name }).from(patients).where(eq(patients.id, appointment.patientId)).limit(1)
    : []
  const [doctor] = appointment.doctorId
    ? await db.select({ id: users.id, name: users.name, specialty: users.specialty }).from(users).where(eq(users.id, appointment.doctorId)).limit(1)
    : []

  const treatments = await db
    .select({
      procedureName: treatmentPlans.procedureName,
      toothNumber: treatmentPlans.toothNumber,
    })
    .from(appointmentTreatments)
    .innerJoin(treatmentPlans, eq(appointmentTreatments.treatmentPlanId, treatmentPlans.id))
    .where(and(eq(appointmentTreatments.appointmentId, appointment.id), ne(treatmentPlans.status, 'cancelled')))

  return {
    clinicName: clinic?.name || 'Diş Kliniği',
    patientName: patient?.name || appointment.intakePatientName || 'Sayın Hastamız',
    doctorName: doctor?.name || null,
    doctorSpecialty: doctor?.specialty || null,
    startTime: appointment.startTime.toISOString(),
    endTime: appointment.endTime.toISOString(),
    status: appointment.status,
    timeConfirmed: appointment.timeConfirmed,
    patientResponseStatus: appointment.patientResponseStatus || null,
    patientResponseNote: appointment.patientResponseNote || null,
    patientPreferredDate: appointment.patientPreferredDate || null,
    patientRespondedAt: appointment.patientRespondedAt ? appointment.patientRespondedAt.toISOString() : null,
    treatments: treatments.map(t => ({
      procedureName: t.procedureName,
      toothNumber: t.toothNumber,
    })),
  }
}

export async function submitPublicAppointmentResponse(
  token: string,
  body: { action?: unknown; note?: unknown; preferredDate?: unknown },
) {
  await ensureTreatmentPlanningSchema()
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    throw new TreatmentPlanError('Randevu bağlantısı geçersiz', 404)
  }
  const action = String(body?.action || '') as PatientResponseAction
  if (!['confirm', 'postpone', 'cancel'].includes(action)) {
    throw new TreatmentPlanError('Geçersiz işlem seçimi', 400)
  }

  const tokenHash = hashToken(token)
  const jobs = await db.execute(sql`
    SELECT clinic_id, appointment_id
    FROM appointment_notification_jobs
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `)
  const job = jobs[0] as { clinic_id?: string; appointment_id?: string } | undefined
  if (!job?.clinic_id || !job?.appointment_id) {
    throw new TreatmentPlanError('Randevu bağlantısı bulunamadı', 404)
  }

  const updated = await applyPatientAppointmentResponse({
    clinicId: String(job.clinic_id),
    appointmentId: String(job.appointment_id),
    action,
    note: typeof body?.note === 'string' ? body.note : null,
    preferredDate: typeof body?.preferredDate === 'string' ? body.preferredDate : null,
    channel: 'link',
  })

  return {
    success: true,
    status: updated?.status || action,
    patientResponseStatus: updated?.patientResponseStatus || null,
  }
}
