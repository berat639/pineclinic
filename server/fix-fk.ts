import { db } from './src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    // Nullify orphan doctor_ids
    await db.execute(sql`
      UPDATE dental_appointments 
      SET doctor_id = NULL 
      WHERE doctor_id NOT IN (SELECT id FROM users);
    `);
    
    await db.execute(sql`
      ALTER TABLE dental_appointments 
      ADD CONSTRAINT dental_appointments_doctor_id_fkey 
      FOREIGN KEY (doctor_id) REFERENCES users(id);
    `);
    
    console.log('Fixed FK constraint!');
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
}
main();
