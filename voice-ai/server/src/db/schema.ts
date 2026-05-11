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
  sessionId: uuid('session_id').references(() => sessions.id),
  calendarEventId: text('calendar_event_id'),
})

export const businessSettings = pgTable('business_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  fileType: text('file_type').notNull().default('txt'),
  originalText: text('original_text').notNull(),
  chunkCount: integer('chunk_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: uuid('document_id').references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  // embedding vector(768) is managed via raw SQL — pgvector type not in drizzle-orm/pg-core
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
