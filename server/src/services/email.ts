import nodemailer from 'nodemailer'
import { getIntegrations } from '../db/repositories/integrations'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  const settings = await getIntegrations()

  // Kontrol: Ayarlar eksik mi?
  if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPass) {
    throw new Error('SMTP ayarları eksik. Lütfen yönetici panelinden e-posta ayarlarını yapılandırın.')
  }

  const port = parseInt(settings.smtpPort, 10)

  // Güvenlik (Secure) durumunu belirle
  let secure = false
  if (settings.smtpSecure === 'ssl') {
    secure = true
  } else if (settings.smtpSecure === 'tls' || settings.smtpSecure === 'none') {
    secure = false // STARTTLS için false olmalıdır, nodemailer port 587'de otomatik dener.
  } else {
    // Eğer smtpSecure ayarlanmamışsa port 465 ise otomatik SSL, değilse STARTTLS varsayılır
    secure = port === 465
  }

  // Transport nesnesini oluştur
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: port,
    secure: secure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    }
  })

  // E-postayı gönder
  const info = await transporter.sendMail({
    from: `"Klinik Sistemi" <${settings.smtpUser}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    text,
    html: html || text,
  })

  console.log(`[Email] E-posta başarıyla gönderildi: ${info.messageId}`)
  return info
}
