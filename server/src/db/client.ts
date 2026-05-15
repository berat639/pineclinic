import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL tanımlı değil')

// Migration client — single connection, no pool (for migration script use)
export const migrationClient = postgres(connectionString, { max: 1 })

// Application pool
const pool = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 1800,
  onnotice: () => {},
})

export const db = drizzle(pool, { schema })

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function closeDb(): Promise<void> {
  await pool.end({ timeout: 5 })
}
