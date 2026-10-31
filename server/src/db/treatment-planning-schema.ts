import { sql } from 'drizzle-orm'

// The migration and startup repair execute the same idempotent statements.
export const treatmentPlanningDDL = [
  `CREATE TABLE IF NOT EXISTS treatment_group_details (
    group_id UUID PRIMARY KEY REFERENCES treatment_groups(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    version INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT,
    request_hash TEXT,
    consultation_note TEXT NOT NULL DEFAULT '',
    discount_percent_bps INTEGER NOT NULL DEFAULT 0,
    discount_fixed_minor BIGINT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS treatment_group_details_request_idx
    ON treatment_group_details(clinic_id, idempotency_key)`,
  `CREATE TABLE IF NOT EXISTS treatment_plan_details (
    treatment_id UUID PRIMARY KEY REFERENCES treatment_plans(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    base_price_minor BIGINT NOT NULL DEFAULT 0,
    net_price_minor BIGINT NOT NULL DEFAULT 0,
    materials JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    stock_state TEXT NOT NULL DEFAULT 'planned'
  )`,
  `CREATE TABLE IF NOT EXISTS treatment_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'tooth',
    price_minor BIGINT NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#0284c7',
    materials JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS treatment_catalog_active_name_idx
    ON treatment_catalog(clinic_id, kind, name_key) WHERE active = true`,
  `CREATE TABLE IF NOT EXISTS patient_consent_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id UUID NOT NULL REFERENCES clinics(id),
    patient_id UUID NOT NULL REFERENCES patients(id), delivery_channel TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, request_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    text_version TEXT NOT NULL, text_snapshot TEXT NOT NULL, requested_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, responded_at TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS patient_consent_request_key_idx ON patient_consent_requests(clinic_id, request_key)`,
  `CREATE TABLE IF NOT EXISTS patient_consent_preferences (
    clinic_id UUID NOT NULL REFERENCES clinics(id), patient_id UUID NOT NULL REFERENCES patients(id),
    channel TEXT NOT NULL, status TEXT NOT NULL, text_version TEXT NOT NULL,
    request_id UUID NOT NULL REFERENCES patient_consent_requests(id), responded_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (clinic_id, patient_id, channel)
  )`,
  `CREATE TABLE IF NOT EXISTS patient_consent_audit (
    id BIGSERIAL PRIMARY KEY, clinic_id UUID NOT NULL REFERENCES clinics(id), patient_id UUID NOT NULL REFERENCES patients(id),
    request_id UUID REFERENCES patient_consent_requests(id), channel TEXT NOT NULL,
    status TEXT NOT NULL, text_version TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS patient_notification_deliveries (
    id BIGSERIAL PRIMARY KEY, clinic_id UUID NOT NULL REFERENCES clinics(id), patient_id UUID NOT NULL REFERENCES patients(id),
    treatment_id UUID NOT NULL REFERENCES treatment_plans(id), due_date TEXT NOT NULL, channel TEXT NOT NULL,
    status TEXT NOT NULL, external_key TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (treatment_id, due_date, channel)
  )`,
  `CREATE INDEX IF NOT EXISTS patient_notification_external_idx ON patient_notification_deliveries(clinic_id, external_key)`,
  `CREATE TABLE IF NOT EXISTS plan_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id UUID NOT NULL REFERENCES clinics(id),
    patient_id UUID NOT NULL REFERENCES patients(id), group_id UUID REFERENCES treatment_groups(id),
    kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', request_key TEXT NOT NULL,
    total_bytes BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS plan_attachment_request_idx ON plan_attachments(clinic_id, request_key)`,
  `CREATE TABLE IF NOT EXISTS plan_attachment_files (
    attachment_id UUID NOT NULL REFERENCES plan_attachments(id) ON DELETE CASCADE,
    file_index INTEGER NOT NULL, name TEXT NOT NULL, content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL, uploaded_bytes BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (attachment_id, file_index)
  )`,
]

let schemaPromise: Promise<void> | undefined

export function ensureTreatmentPlanningSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = (async () => {
    const { db } = await import('./client')
    for (const statement of treatmentPlanningDDL) await db.execute(sql.raw(statement))
  })().catch(error => { schemaPromise = undefined; throw error })
  return schemaPromise
}
