import { sql } from 'drizzle-orm'
import { db } from '../db/client'

async function run() {
  try {
    await db.execute(sql`ALTER TABLE patients ADD COLUMN email TEXT;`)
    console.log('Successfully added email column to patients table.')
  } catch (err: any) {
    if (err.message.includes('already exists')) {
      console.log('Column email already exists.')
    } else {
      console.error('Error:', err)
    }
  }
  process.exit(0)
}

run()
