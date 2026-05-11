import { GoogleGenAI } from '@google/genai'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { accounts } from '../db/schema'
import type { Account } from '../db/schema'

type PoolEntry = {
  client: GoogleGenAI
  account: Account
}

class AccountPool {
  private pool = new Map<string, PoolEntry>()
  private initialized = false

  async initialize(): Promise<void> {
    const rows = await db.select().from(accounts).where(eq(accounts.isActive, true))
    for (const account of rows) {
      this.addAccount(account)
    }
    this.initialized = true
    console.log(`[AccountPool] ${rows.length} hesap yüklendi`)
  }

  addAccount(account: Account): void {
    try {
      const credentials = JSON.parse(Buffer.from(account.credentials, 'base64').toString('utf-8'))
      const client = new GoogleGenAI({
        vertexai: true,
        project: account.projectId,
        location: account.location,
        googleAuthOptions: { credentials },
      })
      this.pool.set(account.id, { client, account })
    } catch (err) {
      console.error(`[AccountPool] Hesap yüklenemedi (${account.name}):`, err)
    }
  }

  removeAccount(accountId: string): void {
    this.pool.delete(accountId)
  }

  get(accountId: string): GoogleGenAI | null {
    return this.pool.get(accountId)?.client ?? null
  }

  getAccount(accountId: string): Account | null {
    return this.pool.get(accountId)?.account ?? null
  }

  getAll(): PoolEntry[] {
    return Array.from(this.pool.values())
  }

  isInitialized(): boolean {
    return this.initialized
  }

  async reload(accountId: string): Promise<void> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    if (account) {
      this.removeAccount(accountId)
      if (account.isActive) this.addAccount(account)
    }
  }
}

export const accountPool = new AccountPool()
