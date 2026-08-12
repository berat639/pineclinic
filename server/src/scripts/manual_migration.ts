import { db } from '../db/client'
import { sql } from 'drizzle-orm'

async function run() {
  console.log('Running manual migration...')
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clinics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        netgsm_usercode text,
        netgsm_password text,
        sms_sender_id text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone DEFAULT now()
      );
      
      CREATE TABLE IF NOT EXISTS notification_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id uuid REFERENCES clinics(id),
        type text NOT NULL,
        name text NOT NULL,
        content text NOT NULL,
        created_at timestamp with time zone DEFAULT now()
      );
      
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id);
      
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id);
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS is_periodic boolean NOT NULL DEFAULT false;
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS period_days integer;
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS next_notification_date text;
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS notify_patient boolean NOT NULL DEFAULT false;
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'sms';
      ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS notification_sent_at timestamp with time zone;
    `)
    console.log('Migration successful!')
  } catch (error) {
    console.error('Migration failed:', error)
  }
  process.exit(0)
}

run()
