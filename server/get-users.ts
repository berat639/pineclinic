import { db } from './src/db/client';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const allUsers = await db.select({ email: users.email, role: users.role }).from(users);
    console.log(JSON.stringify(allUsers, null, 2));
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
}
main();
