import { db } from './src/db/client'
import { sql } from 'drizzle-orm'

async function run() {
  try {
    await db.execute(sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN NOT NULL DEFAULT false;`)
    await db.execute(sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false;`)
    await db.execute(sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;`)
    console.log("Columns added successfully")
  } catch (e) {
    console.error(e)
  }
  process.exit(0)
}

run()
