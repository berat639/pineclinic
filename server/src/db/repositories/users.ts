import { eq } from 'drizzle-orm'
import { db } from '../client'
import { users, userSessions } from '../schema'

export async function createUser(data: {
  email: string
  passwordHash: string
  name: string
  role: string
  phone?: string
  specialty?: string
  color?: string
}) {
  const [user] = await db.insert(users).values(data).returning()
  return user!
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return user ?? null
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return user ?? null
}

export async function listUsers() {
  return db.select({
    id: users.id,
    email: users.email,
    phone: users.phone,
    name: users.name,
    role: users.role,
    specialty: users.specialty,
    color: users.color,
    active: users.active,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
  }).from(users)
}

export async function updateUser(id: string, data: Partial<{
  email: string
  phone: string
  name: string
  role: string
  specialty: string | null
  color: string | null
  active: boolean
  passwordHash: string
  lastLoginAt: Date
}>) {
  const [updated] = await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  return updated ?? null
}

export async function createSession(data: {
  userId: string
  tokenJti: string
  ipAddress?: string
  userAgent?: string
  expiresAt: Date
}) {
  const [session] = await db.insert(userSessions).values(data).returning()
  return session!
}

export async function getSessionByJti(jti: string) {
  const [session] = await db.select().from(userSessions).where(eq(userSessions.tokenJti, jti)).limit(1)
  return session ?? null
}

export async function deleteSessionByJti(jti: string) {
  await db.delete(userSessions).where(eq(userSessions.tokenJti, jti))
}

export async function deleteAllUserSessions(userId: string) {
  await db.delete(userSessions).where(eq(userSessions.userId, userId))
}
