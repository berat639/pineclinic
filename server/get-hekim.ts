import { db } from './src/db/client';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const hekimUsers = await db.select().from(users).where(eq(users.role, 'hekim')).limit(3);
    console.log(JSON.stringify(hekimUsers, null, 2));
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
}
main();
