import { getUserByEmail, createUser } from '../db/repositories/users'

const EMAIL = process.env.INITIAL_ADMIN_EMAIL || 'admin@klinik.com'
const PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'Admin123!'

async function seed() {
  const existing = await getUserByEmail(EMAIL)
  if (existing) {
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
  console.log(`[Seed] Yönetici oluşturuldu: ${user.email} (id: ${user.id})`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('[Seed] Hata:', err)
  process.exit(1)
})
