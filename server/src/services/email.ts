import nodemailer from 'nodemailer'
import type { Config } from '../integrations/managed/model'
import { activeConfig, decrypt, getRow } from '../integrations/managed/store'
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
  let settings = await activeConfig(targetClinicId, 'smtp')
  if (!settings) {
    const row = await getRow(targetClinicId, 'smtp')
    if (row?.draft) settings = decrypt(row.draft as Config)
  }

  // Kontrol: Ayarlar eksik mi?
  if (!settings?.host || !settings.port || !settings.username || !settings.password) {
    throw new Error('SMTP bağlantısı etkin değil. Klinikler ekranında kurulumu tamamlayın.')
  }

  const port = settings.port

  // Güvenlik (Secure) durumunu belirle
  const secure = port === 465 || settings.secure === 'ssl'

  // Transport nesnesini oluştur
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: port,
    secure: secure,
    requireTLS: !secure,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  })

  // E-postayı gönder
  const info = await transporter.sendMail({
    from: `"${settings.fromName || 'Klinik Sistemi'}" <${settings.fromAddress || settings.username}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    text,
    html: html || text,
  })

  console.log(`[Email] E-posta başarıyla gönderildi: ${info.messageId}`)
  return info
}
