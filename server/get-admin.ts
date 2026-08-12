import { db } from './src/db/client';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const adminUsers = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    if (adminUsers.length > 0) {
        const adminEmail = adminUsers[0].email;
        const newHash = await Bun.password.hash('123456');
        await db.update(users).set({ passwordHash: newHash }).where(eq(users.email, adminEmail));
        console.log(`Password reset for ${adminEmail} to 123456`);
    } else {
        console.log('No admin users found!');
    }
  } catch (e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
}
main();
