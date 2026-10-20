import nodemailer from 'nodemailer'
import { activeConfig } from '../integrations/managed/store'
import { requireClinicId } from '../tenancy/context'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  const settings = await activeConfig(requireClinicId(), 'smtp')

  // Kontrol: Ayarlar eksik mi?
  if (!settings?.host || !settings.port || !settings.username || !settings.password) {
    throw new Error('SMTP bağlantısı etkin değil. Klinikler ekranında kurulumu tamamlayın.')
  }

  const port = settings.port

  // Güvenlik (Secure) durumunu belirle
  let secure = false
  if (settings.secure === 'ssl') {
    secure = true
  } else if (settings.secure === 'tls') {
    secure = false // STARTTLS için false olmalıdır, nodemailer port 587'de otomatik dener.
  } else {
    // Eğer smtpSecure ayarlanmamışsa port 465 ise otomatik SSL, değilse STARTTLS varsayılır
    secure = port === 465
  }

  // Transport nesnesini oluştur
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: port,
    secure: secure,
    auth: {
      user: settings.username,
      pass: settings.password,
    }
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
