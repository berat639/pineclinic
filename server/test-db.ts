import { db } from './src/db/client';
import { dentalAppointments } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const [row] = await db.update(dentalAppointments)
      .set({ doctorId: 'ba2532a7-ddfc-4728-869a-e76e8f43bc5d', status: 'scheduled' })
      .where(eq(dentalAppointments.id, '8f8ca6ae-8a14-46fb-b535-1ecc434910f6'))
      .returning();
    console.log('SUCCESS:', row);
  } catch (e) {
    console.error('DB ERROR:', e);
  }
  process.exit(0);
}
main();
