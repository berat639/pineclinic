import { sql } from 'drizzle-orm'
import { db } from '../client'
import { currentClinicId } from '../../tenancy/context'

export type AiUsageSource = 'live_phone' | 'live_web' | 'whatsapp' | 'embedding' | 'simulator'

let usageSchemaReady = false

export async function ensureAiUsageTable(): Promise<void> {
  if (usageSchemaReady) return
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clinic_ai_usage_daily (
        clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        day             DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date,
        source          TEXT NOT NULL DEFAULT 'live_phone',
        prompt_tokens   BIGINT NOT NULL DEFAULT 0,
        response_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens    BIGINT NOT NULL DEFAULT 0,
        call_count      INTEGER NOT NULL DEFAULT 0,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (clinic_id, day, source)
      )
    `)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS clinic_ai_usage_daily_clinic_day_idx ON clinic_ai_usage_daily (clinic_id, day DESC)`)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    usageSchemaReady = true
  } catch {
    // Ignore during startup race
  }
}

export async function recordAiTokenUsage(params: {
  clinicId?: string | null
  source: AiUsageSource
  promptTokens?: number
  responseTokens?: number
  totalTokens?: number
  callCount?: number
}): Promise<void> {
  const clinicId = params.clinicId ?? currentClinicId()
  if (!clinicId) return

  const prompt = Math.max(0, Math.round(Number(params.promptTokens) || 0))
  const response = Math.max(0, Math.round(Number(params.responseTokens) || 0))
  const total = Math.max(prompt + response, Math.round(Number(params.totalTokens) || 0))
  const calls = Math.max(0, Math.round(Number(params.callCount) || 0))
  if (total <= 0 && calls <= 0) return

  try {
    await ensureAiUsageTable()
    await db.execute(sql`
      INSERT INTO clinic_ai_usage_daily (
        clinic_id,
        day,
        source,
        prompt_tokens,
        response_tokens,
        total_tokens,
        call_count,
        updated_at
      )
      VALUES (
        ${clinicId}::uuid,
        (now() AT TIME ZONE 'Europe/Istanbul')::date,
        ${params.source},
        ${prompt},
        ${response},
        ${total},
        ${calls},
        now()
      )
      ON CONFLICT (clinic_id, day, source) DO UPDATE SET
        prompt_tokens   = clinic_ai_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
        response_tokens = clinic_ai_usage_daily.response_tokens + EXCLUDED.response_tokens,
        total_tokens    = clinic_ai_usage_daily.total_tokens + EXCLUDED.total_tokens,
        call_count      = clinic_ai_usage_daily.call_count + EXCLUDED.call_count,
        updated_at      = now()
    `)
  } catch (err) {
    console.warn('[AiUsage] Token kaydı yazılamadı:', err instanceof Error ? err.message : 'unknown')
  }
}

// Sabit kur: yalnızca sunucuda hesapta kullanılır, istemciye gönderilmez.
export const USD_TRY_RATE = 56.5

export function usdToTry(usd: number): number {
  return Number((usd * USD_TRY_RATE).toFixed(2))
}

// Blended Gemini Live/Flash approximate cost per 1M tokens in USD:
// Input ~$1.00 / 1M, Output ~$3.00 / 1M, fallback total ~$2.00 / 1M
function estimateCostUsd(promptTokens: number, responseTokens: number, totalTokens: number): number {
  if (promptTokens > 0 || responseTokens > 0) {
    return (promptTokens * 1.0 + responseTokens * 3.0) / 1_000_000
  }
  return (totalTokens * 2.0) / 1_000_000
}

export async function getClinicTokenStats(clinicId?: string | null) {
  const effectiveClinicId = clinicId ?? currentClinicId()
  if (!effectiveClinicId) {
    return {
      today: 0,
      month: 0,
      total: 0,
      promptToday: 0,
      responseToday: 0,
      bySource: {} as Record<string, number>,
      costTry: { today: 0, month: 0, bySource: {} as Record<string, number> },
    }
  }

  try {
    await ensureAiUsageTable()
    const summaryRows = await db.execute<{
      today_total: number
      today_prompt: number
      today_response: number
      month_total: number
      month_prompt: number
      month_response: number
      all_total: number
    }>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN day = (now() AT TIME ZONE 'Europe/Istanbul')::date THEN total_tokens ELSE 0 END), 0)::bigint AS today_total,
        COALESCE(SUM(CASE WHEN day = (now() AT TIME ZONE 'Europe/Istanbul')::date THEN prompt_tokens ELSE 0 END), 0)::bigint AS today_prompt,
        COALESCE(SUM(CASE WHEN day = (now() AT TIME ZONE 'Europe/Istanbul')::date THEN response_tokens ELSE 0 END), 0)::bigint AS today_response,
        COALESCE(SUM(CASE WHEN date_trunc('month', day::timestamp) = date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')) THEN total_tokens ELSE 0 END), 0)::bigint AS month_total,
        COALESCE(SUM(CASE WHEN date_trunc('month', day::timestamp) = date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')) THEN prompt_tokens ELSE 0 END), 0)::bigint AS month_prompt,
        COALESCE(SUM(CASE WHEN date_trunc('month', day::timestamp) = date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')) THEN response_tokens ELSE 0 END), 0)::bigint AS month_response,
        COALESCE(SUM(total_tokens), 0)::bigint AS all_total
      FROM clinic_ai_usage_daily
      WHERE clinic_id = ${effectiveClinicId}::uuid
    `)

    const sourceRows = await db.execute<{ source: string; prompt: number; response: number; total: number }>(sql`
      SELECT source,
        COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt,
        COALESCE(SUM(response_tokens), 0)::bigint AS response,
        COALESCE(SUM(total_tokens), 0)::bigint AS total
      FROM clinic_ai_usage_daily
      WHERE clinic_id = ${effectiveClinicId}::uuid
        AND day = (now() AT TIME ZONE 'Europe/Istanbul')::date
      GROUP BY source
    `)

    const s = summaryRows[0]
    const today = Number(s?.today_total ?? 0)
    const promptToday = Number(s?.today_prompt ?? 0)
    const responseToday = Number(s?.today_response ?? 0)
    const month = Number(s?.month_total ?? 0)
    const monthPrompt = Number(s?.month_prompt ?? 0)
    const monthResponse = Number(s?.month_response ?? 0)
    const total = Number(s?.all_total ?? 0)

    const bySource: Record<string, number> = {}
    for (const r of sourceRows) {
      bySource[r.source] = Number(r.total || 0)
    }

    const todayCostTry = usdToTry(estimateCostUsd(promptToday, responseToday, today))
    const monthCostTry = usdToTry(estimateCostUsd(monthPrompt, monthResponse, month))
    const costBySource: Record<string, number> = {}
    for (const r of sourceRows) {
      costBySource[r.source] = usdToTry(estimateCostUsd(Number(r.prompt || 0), Number(r.response || 0), Number(r.total || 0)))
    }

    return {
      today,
      month,
      total,
      promptToday,
      responseToday,
      bySource,
      costTry: {
        today: todayCostTry,
        month: monthCostTry,
        bySource: costBySource,
      },
    }
  } catch {
    return {
      today: 0,
      month: 0,
      total: 0,
      promptToday: 0,
      responseToday: 0,
      bySource: {} as Record<string, number>,
      costTry: { today: 0, month: 0, bySource: {} as Record<string, number> },
    }
  }
}

