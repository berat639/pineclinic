// Shared by migration and lazy self-healing. Never removes legacy data.
export const integrationDDL = [
`CREATE TABLE IF NOT EXISTS managed_integrations (
 clinic_id uuid NOT NULL REFERENCES clinics(id), service text NOT NULL CHECK(service IN ('phone','sms','smtp')),
 revision integer NOT NULL DEFAULT 1, draft jsonb NOT NULL, active jsonb, active_revision integer,
 enabled boolean NOT NULL DEFAULT false, legacy boolean NOT NULL DEFAULT false,
 health text NOT NULL DEFAULT 'unknown', checked_at timestamptz,
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(clinic_id,service))`,
`CREATE TABLE IF NOT EXISTS integration_claims (
 kind text NOT NULL, value text NOT NULL, clinic_id uuid NOT NULL REFERENCES clinics(id),
 PRIMARY KEY(kind,value))`,
`CREATE TABLE IF NOT EXISTS integration_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 service text NOT NULL, revision integer NOT NULL, operation_id uuid NOT NULL, kind text NOT NULL,
 target text NOT NULL, status text NOT NULL DEFAULT 'pending', evidence jsonb NOT NULL DEFAULT '{}',
 message text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'), confirmed_at timestamptz,
 UNIQUE(clinic_id,service,operation_id))`,
`CREATE INDEX IF NOT EXISTS integration_tests_clinic_idx ON integration_tests(clinic_id,service,created_at)`
]
