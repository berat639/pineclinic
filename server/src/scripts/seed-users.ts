import { getUserByEmail, createUser } from '../db/repositories/users'
import { db } from '../db/client'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

const EMAIL = process.env.INITIAL_ADMIN_EMAIL || 'admin@klinik.com'
const PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'Admin123!'

async function seed() {
  const existing = await getUserByEmail(EMAIL)
  if (existing) {
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, existing.id))
    console.log(`[Seed] Kullanıcı zaten mevcut: ${EMAIL} (role: ${existing.role})`)
    process.exit(0)
  }

  const hash = await Bun.password.hash(PASSWORD)
  const user = await createUser({
    email: EMAIL,
    passwordHash: hash,
    name: 'Yönetici',
    role: 'yonetici',
  })
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id))
  console.log(`[Seed] Yönetici oluşturuldu: ${user.email} (id: ${user.id})`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('[Seed] Hata:', err)
  process.exit(1)
})
