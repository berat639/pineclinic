import { pgTable, uuid, text, boolean, integer, bigint, timestamp, date, primaryKey } from 'drizzle-orm/pg-core'
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
  accountId: uuid('account_id').references(() => accounts.id),
  startedAt: timestamp('started_at', { withTimezone: true }).default(sql`now()`),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  totalTokens: bigint('total_tokens', { mode: 'number' }).default(0),
  status: text('status').default('active'),
})

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull(),
  type: text('type').notNull(),
  vehicleInfo: text('vehicle_info'),
  issueOrRequest: text('issue_or_request'),
  date: text('date').notNull(),
  time: text('time').notNull(),
  sessionId: text('session_id'),
  calendarEventId: text('calendar_event_id'),
  discountRequested: boolean('discount_requested').default(false),
  notes: text('notes'),
})

export const businessSettings = pgTable('business_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// Single-doc + single-embedding model (admin UI uses category/title/content/active)
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  category: text('category').notNull().default('genel'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  active: boolean('active').notNull().default(true),
  // embedding vector(768) is managed via raw SQL — pgvector type not in drizzle-orm/pg-core
  embeddedAt: timestamp('embedded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text('session_id'),
  filename: text('filename').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

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
