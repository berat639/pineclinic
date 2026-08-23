/**
 * WhatsApp Cloud API (Meta Graph API v20.0) integration service.
 */

const WA_API_BASE = 'https://graph.facebook.com/v20.0'

export interface WhatsAppCredentials {
  phoneNumberId: string
  accessToken: string
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button'
  parameters: Array<{ type: 'text'; text: string }>
}

export async function sendWhatsAppTemplate(
  to: string,
  creds: WhatsAppCredentials,
  templateName: string,
  languageCode: string = 'tr',
  components: TemplateComponent[] = []
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch(`${WA_API_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components.length > 0 ? components : undefined,
        },
      }),
    })

    const data = await res.json() as any
    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`
      if (data?.error?.code === 131026) return { success: false, error: 'OPT_OUT' }
      return { success: false, error: errMsg }
    }
    const messageId = data?.messages?.[0]?.id
    console.log(`[WA] Template sent to ${to}, messageId: ${messageId}`)
    return { success: true, messageId }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function sendWhatsAppText(
  to: string,
  creds: WhatsAppCredentials,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch(`${WA_API_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'text',
        text: { body: text },
      }),
    })

    const data = await res.json() as any
    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`
      if (data?.error?.code === 131026) return { success: false, error: 'OPT_OUT' }
      return { success: false, error: errMsg }
    }
    return { success: true, messageId: data?.messages?.[0]?.id }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export interface TemplateSubmission {
  name: string
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
  language: string
  headerText?: string
  bodyText: string
  footerText?: string
}

export async function submitTemplateToMeta(
  businessId: string,
  accessToken: string,
  tpl: TemplateSubmission
): Promise<{ success: boolean; templateId?: string; status?: string; error?: string }> {
  try {
    const components: any[] = []
    if (tpl.headerText) components.push({ type: 'HEADER', format: 'TEXT', text: tpl.headerText })
    components.push({ type: 'BODY', text: tpl.bodyText })
    if (tpl.footerText) components.push({ type: 'FOOTER', text: tpl.footerText })

    const res = await fetch(`${WA_API_BASE}/${businessId}/message_templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: tpl.name, category: tpl.category, language: tpl.language, components }),
    })

    const data = await res.json() as any
    if (!res.ok) return { success: false, error: data?.error?.message || `HTTP ${res.status}` }
    console.log(`[WA] Template "${tpl.name}" submitted, id: ${data.id}, status: ${data.status}`)
    return { success: true, templateId: data.id, status: data.status }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function syncTemplateStatus(
  templateId: string,
  accessToken: string
): Promise<{ status: string; rejectionReason?: string }> {
  try {
    const res = await fetch(`${WA_API_BASE}/${templateId}?fields=status,rejection_reason`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const data = await res.json() as any
    return { status: data.status ?? 'UNKNOWN', rejectionReason: data.rejection_reason }
  } catch {
    return { status: 'UNKNOWN' }
  }
}

const OPT_OUT_KEYWORDS = [
  'dur', 'durdur', 'iptal', 'vazgeç', 'istemiyorum', 'çık',
  'stop', 'unsubscribe', 'cancel', 'quit',
]

export function detectOptOut(messageText: string): boolean {
  const normalized = messageText.trim().toLowerCase()
  return OPT_OUT_KEYWORDS.some(k => normalized === k || normalized.startsWith(k + ' '))
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (phone.startsWith('+')) return phone
  if (digits.startsWith('0')) return '+9' + digits
  return '+' + digits
}
