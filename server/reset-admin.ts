import { db } from './src/db/client';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const newHash = await Bun.password.hash('123456');
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.email, 'admin@klinik.com'));
    console.log('Password reset for admin@klinik.com to 123456');
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
}
main();
