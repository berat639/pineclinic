import { pgTable, uuid, text, boolean, integer, bigint, timestamp, date, primaryKey, jsonb, uniqueIndex, index, bigserial } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  credentials: text('credentials').notNull(),
  projectId: text('project_id').notNull(),
  location: text('location').notNull().default('europe-west1'),
  isActive: boolean('is_active').default(true),
  priority: integer('priority').default(0),
  dailyTokenLimit: bigint('daily_token_limit', { mode: 'number' }).default(1000000),
  monthlyTokenLimit: bigint('monthly_token_limit', { mode: 'number' }).default(30000000),
  maxConcurrentSessions: integer('max_concurrent_sessions').default(20),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
})

export const accountUsage = pgTable('account_usage', {
  accountId: uuid('account_id').references(() => accounts.id),
  date: date('date').notNull(),
  promptTokens: bigint('prompt_tokens', { mode: 'number' }).default(0),
  responseTokens: bigint('response_tokens', { mode: 'number' }).default(0),
  totalTokens: bigint('total_tokens', { mode: 'number' }).default(0),
  sessionCount: integer('session_count').default(0),
  concurrentSessions: integer('concurrent_sessions').default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.accountId, table.date] }),
}))

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  accountId: uuid('account_id').references(() => accounts.id),
  startedAt: timestamp('started_at', { withTimezone: true }).default(sql`now()`),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  totalTokens: bigint('total_tokens', { mode: 'number' }).default(0),
  status: text('status').default('active'),
})

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  sessionId: text('session_id'),
  calendarEventId: text('calendar_event_id'),
  data: jsonb('data').notNull().default({}),
  // Legacy columns kept for backward-compatible appointment reads.
  customerName: text('customer_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  type: text('type').notNull().default(''),
  vehicleInfo: text('vehicle_info'),
  issueOrRequest: text('issue_or_request'),
  date: text('date').notNull().default(''),
  time: text('time').notNull().default(''),
  discountRequested: boolean('discount_requested').default(false),
  notes: text('notes'),
  extraFields: text('extra_fields'),
})

export const conversationFlows = pgTable('conversation_flows', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  name: text('name').notNull().default('main'),
  direction: text('direction').notNull().default('inbound'),
  nodes: jsonb('nodes').notNull().default([]),
  edges: jsonb('edges').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
})

/** Durable checkpoints only; PCM and transcript chunks are intentionally never stored here. */
export const flowSessions = pgTable('flow_sessions', {
  id: uuid('id').primaryKey(),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  direction: text('direction').notNull(),
  channel: text('channel').notNull(),
  flowId: uuid('flow_id').references(() => conversationFlows.id),
  status: text('status').notNull().default('active'),
  revision: integer('revision').notNull().default(0),
  state: jsonb('state').notNull().default({}),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [index('flow_sessions_expiry_idx').on(t.expiresAt)])

export const businessSettings = pgTable('business_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── Dental Clinic: Patients, Calendar ────────────────────────────────────────

export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  netgsmUsercode: text('netgsm_usercode'),
  netgsmPassword: text('netgsm_password'),
  smsSenderId: text('sms_sender_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Evolution API; secrets use AES-256-GCM.
  evolutionBaseUrl: text('evolution_base_url'),
  evolutionApiKey: text('evolution_api_key'),
  evolutionInstanceName: text('evolution_instance_name'),
  evolutionWebhookSecret: text('evolution_webhook_secret'),
  evolutionConnectionState: text('evolution_connection_state').notNull().default('unconfigured'),
  whatsappSetupStatus: text('whatsapp_setup_status').notNull().default('not_started'),
  whatsappExpectedPhone: text('whatsapp_expected_phone'),
  whatsappLinkedPhone: text('whatsapp_linked_phone'),
  whatsappNumberVerifiedAt: timestamp('whatsapp_number_verified_at', { withTimezone: true }),
  whatsappTestPhone: text('whatsapp_test_phone'),
  whatsappTestCodeHash: text('whatsapp_test_code_hash'),
  whatsappTestExpiresAt: timestamp('whatsapp_test_expires_at', { withTimezone: true }),
  whatsappTestVerifiedAt: timestamp('whatsapp_test_verified_at', { withTimezone: true }),
  whatsappActivatedAt: timestamp('whatsapp_activated_at', { withTimezone: true }),
  whatsappActivatedBy: uuid('whatsapp_activated_by').references(() => users.id),
  whatsappAiEnabled: boolean('whatsapp_ai_enabled').notNull().default(false),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
})

export const clinicDomains = pgTable('clinic_domains', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull().unique(),
  isPrimary: boolean('is_primary').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [index('clinic_domains_clinic_idx').on(t.clinicId)])

export const clinicPhoneNumbers = pgTable('clinic_phone_numbers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  phoneNumber: text('phone_number').notNull(),
  label: text('label'),
  isActive: boolean('is_active').notNull().default(true),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('clinic_phone_numbers_phone_unique').on(t.phoneNumber),
  index('clinic_phone_numbers_clinic_idx').on(t.clinicId),
])

export const clinicSettings = pgTable('clinic_settings', {
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [primaryKey({ columns: [t.clinicId, t.key] })])

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  type: text('type').notNull(), // 'sms', 'email', 'whatsapp'
  name: text('name').notNull(), // e.g. 'periodic_reminder'
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  patientPhone: text('patient_phone'), // E.164; null for unresolved LID senders
  instanceName: text('instance_name'),
  remoteJid: text('remote_jid'),
  aiPaused: boolean('ai_paused').notNull().default(false),
  patientId: uuid('patient_id').references(() => patients.id),
  // Conversation history stored as JSON array of {role, text} for Gemini chat
  history: jsonb('history').notNull().default([]),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [uniqueIndex('wa_conversation_identity').on(t.clinicId, t.instanceName, t.remoteJid)])

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sequence: bigserial('sequence', { mode: 'number' }).notNull(),
  conversationId: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  externalId: text('external_id').notNull(),
  direction: text('direction').notNull(),
  text: text('text').notNull(),
  status: text('status').notNull().default('pending'),
  replyText: text('reply_text'),
  providerMessageId: text('provider_message_id'),
  deliveryStatus: text('delivery_status'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('wa_message_external').on(t.conversationId, t.externalId),
  index('wa_message_pending').on(t.status, t.availableAt),
])

export const whatsappToolExecutions = pgTable('whatsapp_tool_executions', {
  messageId: uuid('message_id').notNull().references(() => whatsappMessages.id),
  name: text('name').notNull(),
  arguments: jsonb('arguments').notNull(),
  result: jsonb('result').notNull(),
}, (t) => [primaryKey({ columns: [t.messageId, t.name] })])

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  tcIdentity: text('tc_identity'),
  gender: text('gender'),
  birthDate: timestamp('birth_date', { withTimezone: true }),
  birthYear: integer('birth_year'),
  balance: integer('balance').notNull().default(0),
  whatsappOptOut: boolean('whatsapp_opt_out').notNull().default(false), // Hasta WA bildirimlerini kapattı mı?
  smsOptOut: boolean('sms_opt_out').notNull().default(false), // Hasta SMS bildirimlerini kapattı mı?
  emailOptOut: boolean('email_opt_out').notNull().default(false), // Hasta Email bildirimlerini kapattı mı?
  isArchived: boolean('is_archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const dentalAppointments = pgTable('dental_appointments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  // AI talepleri desk tarafından doğrulanana kadar gerçek bir hastaya bağlı değildir.
  patientId: uuid('patient_id').references(() => patients.id),
  doctorId: uuid('doctor_id').references(() => users.id),
  title: text('title').notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('scheduled'),
  type: text('type').notNull().default('general'),
  complaint: text('complaint'),
  notes: text('notes'),
  timeConfirmed: boolean('time_confirmed').notNull().default(true),
  intakeSource: text('intake_source'),
  intakePatientName: text('intake_patient_name'),
  intakePatientPhone: text('intake_patient_phone'),
  reviewStatus: text('review_status'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Kept explicitly because the patient sidebar is ordered by the latest
  // appointment operation, not the appointment's scheduled time.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const doctorLeaves = pgTable('doctor_leaves', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'cascade' }),
  doctorId: uuid('doctor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  startTime: text('start_time').notNull(), // 'HH:mm'
  endTime: text('end_time').notNull(), // 'HH:mm'
  isFullDay: boolean('is_full_day').notNull().default(false),
  reason: text('reason'), // 'Yıllık İzin', 'Mazeret', 'Seminer' vb.
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const treatmentGroups = pgTable('treatment_groups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'), // active, completed, cancelled
  createdById: uuid('created_by_id').references(() => users.id),
  updatedById: uuid('updated_by_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const treatmentPlans = pgTable('treatment_plans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  doctorId: uuid('doctor_id').references(() => users.id),
  groupId: uuid('group_id').references(() => treatmentGroups.id),
  procedureName: text('procedure_name').notNull(),
  toothNumber: text('tooth_number'),
  indication: text('indication'),
  cost: integer('cost').notNull().default(0),
  status: text('status').notNull().default('planned'),
  dcmUrl: text('dcm_url'),
  
  // Periodic Notifications
  isPeriodic: boolean('is_periodic').notNull().default(false),
  periodDays: integer('period_days'),
  nextNotificationDate: text('next_notification_date'), // YYYY-MM-DD
  notifyPatient: boolean('notify_patient').notNull().default(false),
  notificationType: text('notification_type').default('sms'), // sms, email, both
  notificationSentAt: timestamp('notification_sent_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Junction table: links appointments to treatment plan items (many-to-many)
// One treatment can be done across multiple appointments (sessions), one appointment can include many treatments
export const appointmentTreatments = pgTable('appointment_treatments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: uuid('appointment_id').notNull().references(() => dentalAppointments.id, { onDelete: 'cascade' }),
  treatmentPlanId: uuid('treatment_plan_id').notNull().references(() => treatmentPlans.id, { onDelete: 'cascade' }),
  sessionNumber: integer('session_number').notNull().default(1), // For multi-session treatments (e.g., Canal 1st, 2nd session)
  sessionStatus: text('session_status').notNull().default('planned'), // planned | done | skipped
  notes: text('notes'), // Session-specific notes
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const patientPayments = pgTable('patient_payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  treatmentPlanId: uuid('treatment_plan_id').references(() => treatmentPlans.id),
  date: text('date').notNull(),
  amount: integer('amount').notNull(),
  method: text('method').notNull().default('Nakit'),
  notes: text('notes'),
  status: text('status').notNull().default('completed'),
  isActive: boolean('is_active').notNull().default(true),
  dueDate: text('due_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Financial documents are intentionally kept separate from collections. A payment
// is not an invoice, and a draft here is never presented as a legally-issued
// e-Invoice/e-Archive document until an authorised integrator confirms it.
export const clinicFinanceSettings = pgTable('clinic_finance_settings', {
  clinicId: uuid('clinic_id').primaryKey().references(() => clinics.id, { onDelete: 'cascade' }),
  legalName: text('legal_name'),
  taxNumber: text('tax_number'),
  taxOffice: text('tax_office'),
  mersisNumber: text('mersis_number'),
  address: text('address'),
  email: text('email'),
  invoicePrefix: text('invoice_prefix').notNull().default('KLC'),
  eDocumentProvider: text('e_document_provider').notNull().default('none'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const financialDocuments = pgTable('financial_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  patientId: uuid('patient_id').references(() => patients.id),
  paymentId: uuid('payment_id').references(() => patientPayments.id),
  documentType: text('document_type').notNull().default('e_archive_draft'),
  status: text('status').notNull().default('draft'),
  documentNumber: text('document_number').notNull(),
  issueDate: text('issue_date').notNull(),
  dueDate: text('due_date'),
  recipientName: text('recipient_name').notNull(),
  recipientIdentifier: text('recipient_identifier'),
  recipientAddress: text('recipient_address'),
  currency: text('currency').notNull().default('TRY'),
  subtotal: integer('subtotal').notNull().default(0),
  taxTotal: integer('tax_total').notNull().default(0),
  grandTotal: integer('grand_total').notNull().default(0),
  provider: text('provider'),
  providerDocumentId: text('provider_document_id'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  clinicDocumentNumber: uniqueIndex('financial_documents_clinic_number_idx').on(table.clinicId, table.documentNumber),
  clinicIssueDate: index('financial_documents_clinic_issue_date_idx').on(table.clinicId, table.issueDate),
}))

export const financialDocumentLines = pgTable('financial_document_lines', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: uuid('document_id').notNull().references(() => financialDocuments.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: integer('unit_price').notNull(),
  taxRate: integer('tax_rate').notNull().default(0),
  netAmount: integer('net_amount').notNull(),
  taxAmount: integer('tax_amount').notNull().default(0),
  totalAmount: integer('total_amount').notNull(),
})

// Credentials are encrypted at rest by the finance API. Provider adapters can
// consume this table without changing the clinic's core payment records.
export const onlinePaymentProviders = pgTable('online_payment_providers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  merchantId: text('merchant_id'),
  apiKeyEncrypted: text('api_key_encrypted'),
  secretEncrypted: text('secret_encrypted'),
  webhookSecretEncrypted: text('webhook_secret_encrypted'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  clinicProvider: uniqueIndex('online_payment_providers_clinic_provider_idx').on(table.clinicId, table.provider),
}))

export const onlinePaymentTransactions = pgTable('online_payment_transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  paymentId: uuid('payment_id').references(() => patientPayments.id),
  provider: text('provider').notNull(),
  providerTransactionId: text('provider_transaction_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('prepared'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('TRY'),
  checkoutUrl: text('checkout_url'),
  callbackPayload: jsonb('callback_payload'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idempotency: uniqueIndex('online_payment_transactions_idempotency_idx').on(table.clinicId, table.idempotencyKey),
  providerTransaction: uniqueIndex('online_payment_transactions_provider_transaction_idx').on(table.provider, table.providerTransactionId),
}))

export const completedWorks = pgTable('completed_works', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  doctorId: uuid('doctor_id').notNull().references(() => users.id),
  date: text('date').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Single-doc + single-embedding model (admin UI uses category/title/content/active)
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  category: text('category').notNull().default('genel'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  active: boolean('active').notNull().default(true),
  callDirection: text('call_direction').notNull().default('both'),
  // embedding vector(768) is managed via raw SQL — pgvector type not in drizzle-orm/pg-core
  embeddedAt: timestamp('embedded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  sessionId: text('session_id'),
  filename: text('filename').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const knowledgeCategories = pgTable('knowledge_categories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  icon: text('icon').notNull().default('📁'),
  color: text('color').notNull().default('#60a5fa'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [uniqueIndex('knowledge_categories_clinic_slug_unique').on(t.clinicId, t.slug)])

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type AccountUsage = typeof accountUsage.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Appointment = typeof appointments.$inferSelect
export type NewAppointment = typeof appointments.$inferInsert
export type BusinessSetting = typeof businessSettings.$inferSelect
export type Recording = typeof recordings.$inferSelect
export type NewRecording = typeof recordings.$inferInsert

export type KnowledgeCategory = typeof knowledgeCategories.$inferSelect

// ── RBAC: Users, Sessions, Shifts, Notifications, Audit ─────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  role: text('role').notNull().default('host'),
  specialty: text('specialty'),
  color: text('color'),
  active: boolean('active').notNull().default(true),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const clinicMemberships = pgTable('clinic_memberships', {
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('host'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.clinicId, t.userId] }),
  index('clinic_memberships_user_idx').on(t.userId),
])

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenJti: text('token_jti').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  shiftType: text('shift_type').notNull().default('tam'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const shiftPlanOperations = pgTable('shift_plan_operations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  requestId: text('request_id').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const shiftPlanOperationItems = pgTable('shift_plan_operation_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  operationId: uuid('operation_id').notNull().references(() => shiftPlanOperations.id, { onDelete: 'cascade' }),
  shiftId: uuid('shift_id').references(() => shifts.id),
  action: text('action').notNull(),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state').notNull(),
})

export const shiftSwapRequests = pgTable('shift_swap_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  targetId: uuid('target_id').notNull().references(() => users.id),
  shiftId: uuid('shift_id').notNull().references(() => shifts.id),
  targetShiftId: uuid('target_shift_id').references(() => shifts.id),
  status: text('status').notNull().default('pending'),
  reason: text('reason'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata').default({}),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  category: text('category').notNull().default('malzeme'),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitCost: integer('unit_cost').notNull().default(0),
  totalCost: integer('total_cost').notNull().default(0),
  enteredBy: uuid('entered_by').references(() => users.id),
  notes: text('notes'),
  date: text('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  name: text('name').notNull(),
  category: text('category').notNull().default('genel'),
  brand: text('brand'),
  quantity: integer('quantity').notNull().default(0),
  minThreshold: integer('min_threshold').notNull().default(5),
  unit: text('unit').notNull().default('adet'),
  costPerUnit: integer('cost_per_unit').notNull().default(0),
  expiryDate: text('expiry_date'),
  supplierName: text('supplier_name'),
  lastRestockedAt: timestamp('last_restocked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const deviceMaintenances = pgTable('device_maintenances', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  deviceName: text('device_name').notNull(),
  maintenanceType: text('maintenance_type').notNull(),
  isPeriodic: boolean('is_periodic').notNull().default(false),
  periodicDays: integer('periodic_days'),
  scheduledDate: text('scheduled_date').notNull(),
  nextMaintenanceDate: text('next_maintenance_date'),
  completedDate: text('completed_date'),
  serialNumber: text('serial_number'),
  maintenanceFirm: text('maintenance_firm'),
  warrantyEnd: text('warranty_end'),
  deviceStatus: text('device_status').notNull().default('active'),
  notes: text('notes'),
  status: text('status').notNull().default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id),
  type: text('type').notNull(),
  quantity: integer('quantity').notNull(),
  notes: text('notes'),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const waitingList = pgTable('waiting_list', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  preferredDoctorId: uuid('preferred_doctor_id').references(() => users.id),
  preferredDate: text('preferred_date'),
  preferredTimeRange: text('preferred_time_range'),
  notes: text('notes'),
  status: text('status').notNull().default('waiting'),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const attendance = pgTable('attendance', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: text('date').notNull(),
  clockIn: timestamp('clock_in', { withTimezone: true }),
  clockOut: timestamp('clock_out', { withTimezone: true }),
  totalHours: integer('total_hours'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const toothRecords = pgTable('tooth_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  toothNumber: integer('tooth_number').notNull(),
  surface: text('surface'),
  condition: text('condition').notNull().default('healthy'),
  treatmentId: uuid('treatment_id').references(() => treatmentPlans.id),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').references(() => users.id),
  date: text('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const procedureTemplates = pgTable('procedure_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  doctorId: uuid('doctor_id').references(() => users.id),
  name: text('name').notNull(),
  defaultDurationMin: integer('default_duration_min').notNull().default(30),
  defaultCost: integer('default_cost').notNull().default(0),
  toothSurfaces: text('tooth_surfaces'),
  category: text('category').notNull().default('genel'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const consultations = pgTable('consultations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  doctorId: uuid('doctor_id').references(() => users.id),
  consultationNote: text('consultation_note').notNull(),
  diseaseNote: text('disease_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const doctorNotes = pgTable('doctor_notes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  doctorId: uuid('doctor_id').notNull().references(() => users.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const patientAnamnesis = pgTable('patient_anamnesis', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  formData: jsonb('form_data').notNull().default({}),
  filledBy: uuid('filled_by').references(() => users.id),
  filledAt: timestamp('filled_at', { withTimezone: true }).defaultNow(),
})

export const patientDiseases = pgTable('patient_diseases', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  name: text('name').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const doctorAvailability = pgTable('doctor_availability', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  doctorId: uuid('doctor_id').notNull().references(() => users.id),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  isActive: boolean('is_active').notNull().default(true),
})

export const calendarBlocks = pgTable('calendar_blocks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  doctorId: uuid('doctor_id').notNull().references(() => users.id),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const materialUsages = pgTable('material_usages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  doctorId: uuid('doctor_id').notNull().references(() => users.id),
  patientId: uuid('patient_id').references(() => patients.id),
  appointmentId: uuid('appointment_id').references(() => dentalAppointments.id),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id),
  quantity: integer('quantity').notNull().default(1),
  date: text('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const installmentPlans = pgTable('installment_plans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  totalAmount: integer('total_amount').notNull(),
  installmentCount: integer('installment_count').notNull(),
  paidCount: integer('paid_count').notNull().default(0),
  installments: jsonb('installments').notNull().default([]),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const revenueTargets = pgTable('revenue_targets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  targetAmount: integer('target_amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const patientNotes = pgTable('patient_notes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  patientId: uuid('patient_id').references(() => patients.id),
  phone: text('phone'),
  content: text('content').notNull(),
  source: text('source').notNull().default('voice'),
  status: text('status').notNull().default('unread'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
})

export const vipAssistants = pgTable('vip_assistants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clinicId: uuid('clinic_id').references(() => clinics.id),
  phone: text('phone').notNull(),
  contactName: text('contact_name'),
  greeting: text('greeting').notNull().default("Merhaba! Ben Berat Bey'in kişisel asistanı Pine Asistan, hoş geldiniz! Nasıl yardımcı olabilirim?"),
  customPrompt: text('custom_prompt'),
  groundingEnabled: boolean('grounding_enabled').notNull().default(true),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [uniqueIndex('vip_assistants_clinic_phone_unique').on(t.clinicId, t.phone)])

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Shift = typeof shifts.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type NewKnowledgeCategory = typeof knowledgeCategories.$inferInsert
export type PatientDisease = typeof patientDiseases.$inferSelect
export type NewPatientDisease = typeof patientDiseases.$inferInsert
export type PatientNote = typeof patientNotes.$inferSelect
export type NewPatientNote = typeof patientNotes.$inferInsert
export type VipAssistant = typeof vipAssistants.$inferSelect
export type NewVipAssistant = typeof vipAssistants.$inferInsert
export type DoctorLeave = typeof doctorLeaves.$inferSelect
export type NewDoctorLeave = typeof doctorLeaves.$inferInsert
