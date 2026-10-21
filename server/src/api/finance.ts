import { Elysia } from 'elysia'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/client'
import {
  auditLog,
  clinicFinanceSettings,
  financialDocumentLines,
  financialDocuments,
  onlinePaymentProviders,
  onlinePaymentTransactions,
  patientPayments,
  patients,
} from '../db/schema'
import { authenticateRequest } from '../middleware/auth'
import { sealSecret } from '../services/integration-secrets'
import { requireClinicId } from '../tenancy/context'

const SUPPORTED_PAYMENT_PROVIDERS = new Set(['iyzico', 'paytr', 'stripe'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
let financeSchemaPromise: Promise<void> | null = null

/** Keeps finance routes available if a container starts before the migration step finishes. */
export function ensureFinanceSchema(): Promise<void> {
  if (!financeSchemaPromise) financeSchemaPromise = (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS clinic_finance_settings (clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE, legal_name TEXT, tax_number TEXT, tax_office TEXT, mersis_number TEXT, address TEXT, email TEXT, invoice_prefix TEXT NOT NULL DEFAULT 'KLC', e_document_provider TEXT NOT NULL DEFAULT 'none', updated_at TIMESTAMPTZ DEFAULT now())`)
    await db.execute(sql`CREATE TABLE IF NOT EXISTS financial_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, patient_id UUID REFERENCES patients(id), payment_id UUID REFERENCES patient_payments(id), document_type TEXT NOT NULL DEFAULT 'e_archive_draft', status TEXT NOT NULL DEFAULT 'draft', document_number TEXT NOT NULL, issue_date TEXT NOT NULL, due_date TEXT, recipient_name TEXT NOT NULL, recipient_identifier TEXT, recipient_address TEXT, currency TEXT NOT NULL DEFAULT 'TRY', subtotal INTEGER NOT NULL DEFAULT 0, tax_total INTEGER NOT NULL DEFAULT 0, grand_total INTEGER NOT NULL DEFAULT 0, provider TEXT, provider_document_id TEXT, notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`)
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS financial_documents_clinic_number_idx ON financial_documents (clinic_id, document_number)`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS financial_documents_clinic_issue_date_idx ON financial_documents (clinic_id, issue_date)`)
    await db.execute(sql`CREATE TABLE IF NOT EXISTS financial_document_lines (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES financial_documents(id) ON DELETE CASCADE, line_no INTEGER NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, unit_price INTEGER NOT NULL, tax_rate INTEGER NOT NULL DEFAULT 0, net_amount INTEGER NOT NULL, tax_amount INTEGER NOT NULL DEFAULT 0, total_amount INTEGER NOT NULL)`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS financial_document_lines_document_idx ON financial_document_lines (document_id, line_no)`)
    await db.execute(sql`CREATE TABLE IF NOT EXISTS online_payment_providers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, provider TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false, merchant_id TEXT, api_key_encrypted TEXT, secret_encrypted TEXT, webhook_secret_encrypted TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`)
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS online_payment_providers_clinic_provider_idx ON online_payment_providers (clinic_id, provider)`)
    await db.execute(sql`CREATE TABLE IF NOT EXISTS online_payment_transactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, payment_id UUID REFERENCES patient_payments(id), provider TEXT NOT NULL, provider_transaction_id TEXT, idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared', amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY', checkout_url TEXT, callback_payload JSONB, expires_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`)
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS online_payment_transactions_idempotency_idx ON online_payment_transactions (clinic_id, idempotency_key)`)
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS online_payment_transactions_provider_transaction_idx ON online_payment_transactions (provider, provider_transaction_id)`)
  })().catch(error => { financeSchemaPromise = null; throw error })
  return financeSchemaPromise
}

function csvCell(value: unknown) {
  const raw = value == null ? '' : String(value)
  return /[;"\n\r]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw
}

async function financeUser(cookie: any, set: any) {
  const user = await authenticateRequest(cookie.token?.value as string | undefined)
  if (!user) { set.status = 401; return null }
  if (user.role !== 'yonetici') { set.status = 403; return null }
  return user
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

function asAmount(value: unknown) {
  const amount = Math.round(Number(value))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function safePrefix(value: unknown) {
  const prefix = String(value || 'KLC').toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g, '').slice(0, 12)
  return prefix || 'KLC'
}

/**
 * Finance data model and accountant export surface. It deliberately stops at
 * "draft / ready_for_provider": issuing an e-Invoice/e-Archive requires a
 * contracted integrator and legal verification, neither of which is guessed.
 */
export const financePlugin = new Elysia({ prefix: '/api/finance' })
  .onStart(async () => { await ensureFinanceSchema() })
  .get('/settings', async ({ cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const [settings] = await db.select().from(clinicFinanceSettings)
      .where(eq(clinicFinanceSettings.clinicId, requireClinicId()))
    return settings ?? {
      legalName: null, taxNumber: null, taxOffice: null, mersisNumber: null,
      address: null, email: null, invoicePrefix: 'KLC', eDocumentProvider: 'none',
    }
  })
  .put('/settings', async ({ body, cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const b = body as Record<string, unknown>
    const clinicId = requireClinicId()
    const values = {
      legalName: typeof b.legalName === 'string' ? b.legalName.trim() || null : null,
      taxNumber: typeof b.taxNumber === 'string' ? b.taxNumber.replace(/\s/g, '') || null : null,
      taxOffice: typeof b.taxOffice === 'string' ? b.taxOffice.trim() || null : null,
      mersisNumber: typeof b.mersisNumber === 'string' ? b.mersisNumber.replace(/\s/g, '') || null : null,
      address: typeof b.address === 'string' ? b.address.trim() || null : null,
      email: typeof b.email === 'string' ? b.email.trim() || null : null,
      invoicePrefix: safePrefix(b.invoicePrefix),
      eDocumentProvider: typeof b.eDocumentProvider === 'string' ? b.eDocumentProvider.slice(0, 40) || 'none' : 'none',
      updatedAt: sql`now()`,
    }
    const [row] = await db.insert(clinicFinanceSettings).values({ clinicId, ...values })
      .onConflictDoUpdate({ target: clinicFinanceSettings.clinicId, set: values }).returning()
    await db.insert(auditLog).values({ clinicId, userId: user.id, action: 'finance.settings.updated', targetType: 'clinic', targetId: clinicId })
    return row
  })
  .get('/online-providers', async ({ cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const rows = await db.select({
      provider: onlinePaymentProviders.provider,
      enabled: onlinePaymentProviders.enabled,
      merchantId: onlinePaymentProviders.merchantId,
      hasApiKey: sql<boolean>`(${onlinePaymentProviders.apiKeyEncrypted} IS NOT NULL)`,
      hasSecret: sql<boolean>`(${onlinePaymentProviders.secretEncrypted} IS NOT NULL)`,
      hasWebhookSecret: sql<boolean>`(${onlinePaymentProviders.webhookSecretEncrypted} IS NOT NULL)`,
      updatedAt: onlinePaymentProviders.updatedAt,
    }).from(onlinePaymentProviders).where(eq(onlinePaymentProviders.clinicId, requireClinicId()))
    return rows
  })
  .put('/online-providers/:provider', async ({ params, body, cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const provider = params.provider.toLowerCase()
    if (!SUPPORTED_PAYMENT_PROVIDERS.has(provider)) { set.status = 400; return { error: 'Desteklenen sağlayıcılar: iyzico, paytr, stripe' } }
    const b = body as Record<string, unknown>
    const clinicId = requireClinicId()
    const [current] = await db.select().from(onlinePaymentProviders)
      .where(and(eq(onlinePaymentProviders.clinicId, clinicId), eq(onlinePaymentProviders.provider, provider)))
    try {
      const values = {
        enabled: b.enabled === true,
        merchantId: typeof b.merchantId === 'string' ? b.merchantId.trim() || null : current?.merchantId || null,
        apiKeyEncrypted: typeof b.apiKey === 'string' && b.apiKey ? sealSecret(b.apiKey) : current?.apiKeyEncrypted || null,
        secretEncrypted: typeof b.secret === 'string' && b.secret ? sealSecret(b.secret) : current?.secretEncrypted || null,
        webhookSecretEncrypted: typeof b.webhookSecret === 'string' && b.webhookSecret ? sealSecret(b.webhookSecret) : current?.webhookSecretEncrypted || null,
        updatedAt: sql`now()`,
      }
      const [row] = await db.insert(onlinePaymentProviders).values({ clinicId, provider, ...values })
        .onConflictDoUpdate({ target: [onlinePaymentProviders.clinicId, onlinePaymentProviders.provider], set: values }).returning()
      await db.insert(auditLog).values({ clinicId, userId: user.id, action: 'finance.online_provider.updated', targetType: 'online_payment_provider', targetId: row!.id, metadata: { provider, enabled: values.enabled } })
      return { provider: row!.provider, enabled: row!.enabled, merchantId: row!.merchantId, hasApiKey: !!row!.apiKeyEncrypted, hasSecret: !!row!.secretEncrypted, hasWebhookSecret: !!row!.webhookSecretEncrypted }
    } catch (error: any) {
      set.status = 400
      return { error: error?.message || 'Sağlayıcı ayarı kaydedilemedi' }
    }
  })
  .post('/online-transactions', async ({ body, cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const b = body as Record<string, unknown>
    const provider = String(b.provider || '').toLowerCase()
    const paymentId = typeof b.paymentId === 'string' ? b.paymentId : ''
    if (!SUPPORTED_PAYMENT_PROVIDERS.has(provider) || !paymentId) { set.status = 400; return { error: 'Sağlayıcı ve ödeme kaydı gerekli' } }
    const clinicId = requireClinicId()
    const [[providerConfig], [payment]] = await Promise.all([
      db.select().from(onlinePaymentProviders).where(and(eq(onlinePaymentProviders.clinicId, clinicId), eq(onlinePaymentProviders.provider, provider), eq(onlinePaymentProviders.enabled, true))),
      db.select().from(patientPayments).where(and(eq(patientPayments.id, paymentId), eq(patientPayments.clinicId, clinicId))),
    ])
    if (!providerConfig || !payment) { set.status = 422; return { error: 'Aktif sağlayıcı veya ödeme kaydı bulunamadı' } }
    if (!providerConfig.apiKeyEncrypted || !providerConfig.secretEncrypted) { set.status = 422; return { error: 'Sağlayıcı API bilgileri eksik' } }
    const idempotencyKey = typeof b.idempotencyKey === 'string' && b.idempotencyKey.trim() ? b.idempotencyKey.trim().slice(0, 120) : randomUUID()
    const [transaction] = await db.insert(onlinePaymentTransactions).values({
      clinicId, paymentId, provider, idempotencyKey, amount: payment.amount, currency: 'TRY', status: 'prepared',
    }).onConflictDoNothing().returning()
    if (!transaction) { set.status = 409; return { error: 'Bu idempotency anahtarı ile bir işlem zaten hazırlanmış' } }
    await db.insert(auditLog).values({ clinicId, userId: user.id, action: 'finance.online_transaction.prepared', targetType: 'online_payment_transaction', targetId: transaction.id, metadata: { provider, paymentId } })
    return { ...transaction, notice: 'İşlem güvenle hazırlandı. Sağlayıcıya canlı istek gönderimi, seçilen sağlayıcının checkout adaptörü etkinleştirildiğinde yapılır.' }
  })
  .get('/documents', async ({ query, cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200)
    return db.select({
      id: financialDocuments.id, documentType: financialDocuments.documentType, status: financialDocuments.status,
      documentNumber: financialDocuments.documentNumber, issueDate: financialDocuments.issueDate,
      recipientName: financialDocuments.recipientName, recipientIdentifier: financialDocuments.recipientIdentifier,
      subtotal: financialDocuments.subtotal, taxTotal: financialDocuments.taxTotal, grandTotal: financialDocuments.grandTotal,
      provider: financialDocuments.provider, patientName: patients.name, createdAt: financialDocuments.createdAt,
    }).from(financialDocuments).leftJoin(patients, eq(financialDocuments.patientId, patients.id))
      .where(eq(financialDocuments.clinicId, requireClinicId())).orderBy(desc(financialDocuments.issueDate), desc(financialDocuments.createdAt)).limit(limit)
  })
  .post('/documents', async ({ body, cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const b = body as Record<string, unknown>
    const amount = asAmount(b.amount)
    const quantity = Math.max(1, Math.min(10000, Math.round(Number(b.quantity || 1))))
    const taxRate = Math.round(Number(b.taxRate || 0))
    const issueDate = b.issueDate || new Date().toISOString().slice(0, 10)
    const recipientName = typeof b.recipientName === 'string' ? b.recipientName.trim() : ''
    const description = typeof b.description === 'string' ? b.description.trim() : ''
    if (!amount || !validDate(issueDate) || !recipientName || !description || taxRate < 0 || taxRate > 100) {
      set.status = 400
      return { error: 'Alıcı, hizmet açıklaması, geçerli tarih, tutar ve KDV oranı gerekli' }
    }
    const clinicId = requireClinicId()
    const paymentId = typeof b.paymentId === 'string' && b.paymentId ? b.paymentId : null
    let patientId: string | null = typeof b.patientId === 'string' && b.patientId ? b.patientId : null
    if (paymentId) {
      const [payment] = await db.select({ patientId: patientPayments.patientId }).from(patientPayments)
        .where(and(eq(patientPayments.id, paymentId), eq(patientPayments.clinicId, clinicId)))
      if (!payment) { set.status = 404; return { error: 'Ödeme kaydı bulunamadı' } }
      patientId = payment.patientId
    }
    const [settings] = await db.select().from(clinicFinanceSettings).where(eq(clinicFinanceSettings.clinicId, clinicId))
    const prefix = safePrefix(settings?.invoicePrefix)
    const netAmount = amount * quantity
    const taxAmount = Math.round(netAmount * taxRate / 100)
    const documentNumber = `${prefix}-TASLAK-${issueDate.replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`
    const [document] = await db.transaction(async tx => {
      const [created] = await tx.insert(financialDocuments).values({
        clinicId, patientId, paymentId, documentType: typeof b.documentType === 'string' ? b.documentType.slice(0, 40) : 'e_archive_draft',
        status: 'draft', documentNumber, issueDate, dueDate: validDate(b.dueDate) ? b.dueDate : null,
        recipientName, recipientIdentifier: typeof b.recipientIdentifier === 'string' ? b.recipientIdentifier.trim() || null : null,
        recipientAddress: typeof b.recipientAddress === 'string' ? b.recipientAddress.trim() || null : null,
        subtotal: netAmount, taxTotal: taxAmount, grandTotal: netAmount + taxAmount,
        notes: typeof b.notes === 'string' ? b.notes.trim() || null : null, createdBy: user.id,
      }).returning()
      await tx.insert(financialDocumentLines).values({
        documentId: created!.id, lineNo: 1, description, quantity,
        unitPrice: amount, taxRate, netAmount, taxAmount, totalAmount: netAmount + taxAmount,
      })
      return [created]
    })
    await db.insert(auditLog).values({ clinicId, userId: user.id, action: 'finance.document.drafted', targetType: 'financial_document', targetId: document!.id })
    return { ...document, legalNotice: 'Bu belge taslaktır. Yetkili e-Belge entegratörü tarafından onaylanmadan hukuki fatura yerine geçmez.' }
  })
  .get('/accounting-export', async ({ query, cookie, set }) => {
    const user = await financeUser(cookie, set)
    if (!user) return { error: 'Yetki yok' }
    const month = typeof query.month === 'string' && /^\d{4}-\d{2}$/.test(query.month) ? query.month : new Date().toISOString().slice(0, 7)
    const rows = await db.select({
      issueDate: financialDocuments.issueDate, documentType: financialDocuments.documentType, status: financialDocuments.status,
      documentNumber: financialDocuments.documentNumber, recipientName: financialDocuments.recipientName,
      recipientIdentifier: financialDocuments.recipientIdentifier, subtotal: financialDocuments.subtotal,
      taxTotal: financialDocuments.taxTotal, grandTotal: financialDocuments.grandTotal, currency: financialDocuments.currency,
    }).from(financialDocuments).where(and(
      eq(financialDocuments.clinicId, requireClinicId()),
      gte(financialDocuments.issueDate, `${month}-01`), lte(financialDocuments.issueDate, `${month}-31`),
    )).orderBy(financialDocuments.issueDate, financialDocuments.documentNumber)
    const header = ['Tarih', 'Belge Tipi', 'Durum', 'Belge No', 'Alıcı / Cari', 'VKN / TCKN', 'Matrah', 'KDV', 'Genel Toplam', 'Para Birimi']
    const csv = ['\uFEFF' + header.join(';'), ...rows.map(row => [row.issueDate, row.documentType, row.status, row.documentNumber, row.recipientName, row.recipientIdentifier, row.subtotal, row.taxTotal, row.grandTotal, row.currency].map(csvCell).join(';'))].join('\r\n')
    set.headers['content-type'] = 'text/csv; charset=utf-8'
    set.headers['content-disposition'] = `attachment; filename="muhasebe-${month}.csv"`
    return csv
  })
