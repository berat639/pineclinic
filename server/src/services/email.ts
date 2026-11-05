import nodemailer from 'nodemailer'
import type { Config } from '../integrations/managed/model'
import { resolveEffectiveConfig } from '../integrations/managed/store'
import { describeSmtpError, sendSmtpMailWithFallback } from '../integrations/managed/workflow'
import { requireClinicId } from '../tenancy/context'

export interface SendEmailOptions {
  clinicId?: string
  to: string | string[]
  subject: string
  text?: string
  html?: string
}

export async function sendEmail({ clinicId, to, subject, text, html }: SendEmailOptions) {
  const targetClinicId = clinicId || requireClinicId()
  let settings: Config | null = await resolveEffectiveConfig(targetClinicId, 'smtp')

  if (!settings && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const envPort = Number(process.env.SMTP_PORT) || 587
    settings = {
      host: process.env.SMTP_HOST,
      port: envPort,
      secure: envPort === 465 ? 'ssl' : 'tls',
      username: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      fromAddress: process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: process.env.DEFAULT_CLINIC_NAME || 'Klinik Sistemi',
    }
  }

  // Kontrol: Ayarlar eksik mi?
  if (!settings?.host || !settings.port || !settings.username || !settings.password) {
    throw new Error('SMTP bağlantısı etkin değil. 💡 Öneri: Panel → Entegrasyonlar veya Klinikler ekranından E-posta / SMTP kurulumunu tamamlayın.')
  }

  try {
    const info = await sendSmtpMailWithFallback(settings, {
      from: `"${settings.fromName || 'Klinik Sistemi'}" <${settings.fromAddress || settings.username}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html: html || text,
    })

    console.log(`[Email] E-posta başarıyla gönderildi: ${info.messageId}`)
    return info
  } catch (err: any) {
    throw new Error(describeSmtpError(err, settings))
  }
}
