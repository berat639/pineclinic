import { sql as drizzleSql, eq } from 'drizzle-orm'
import { db } from '../client'
import { knowledgeCategories, knowledgeDocuments } from '../schema'

export interface CategoryRow {
  id: string
  slug: string
  label: string
  icon: string
  color: string
  sortOrder: number
  createdAt: string
}

/** Default categories seeded on first run */
export const DEFAULT_CATEGORIES: Omit<CategoryRow, 'id' | 'createdAt'>[] = [
  { slug: 'genel', label: 'Genel', icon: '🌐', color: '#60a5fa', sortOrder: 0 },
  { slug: 'servis', label: 'Servis', icon: '🔧', color: '#34d399', sortOrder: 1 },
  { slug: 'galeri', label: 'Galeri', icon: '🏪', color: '#a78bfa', sortOrder: 2 },
  { slug: 'kampanya', label: 'Kampanya', icon: '🎯', color: '#fb923c', sortOrder: 3 },
  { slug: 'sss', label: 'SSS', icon: '❓', color: '#f59e0b', sortOrder: 4 },
  { slug: 'arac', label: 'Araç', icon: '🚗', color: '#38bdf8', sortOrder: 5 },
  { slug: 'musteri', label: 'Müşteri', icon: '👤', color: '#f472b6', sortOrder: 6 },
]

function toRow(r: typeof knowledgeCategories.$inferSelect): CategoryRow {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    icon: r.icon,
    color: r.color,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt?.toISOString() ?? '',
  }
}

export async function listCategories(): Promise<CategoryRow[]> {
  const rows = await db
    .select()
    .from(knowledgeCategories)
    .orderBy(knowledgeCategories.sortOrder)
  return rows.map(toRow)
}

export async function createCategory(data: {
  slug: string
  label: string
  icon?: string
  color?: string
  sortOrder?: number
}): Promise<CategoryRow> {
  const [row] = await db.insert(knowledgeCategories).values({
    slug: data.slug.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    label: data.label,
    icon: data.icon ?? '📁',
    color: data.color ?? '#60a5fa',
    sortOrder: data.sortOrder ?? 99,
  }).returning()
  return toRow(row)
}

export async function updateCategory(
  id: string,
  data: Partial<{ label: string; icon: string; color: string; sortOrder: number }>,
): Promise<CategoryRow | null> {
  const sets: ReturnType<typeof drizzleSql>[] = []
  if (data.label !== undefined) sets.push(drizzleSql`label = ${data.label}`)
  if (data.icon !== undefined) sets.push(drizzleSql`icon = ${data.icon}`)
  if (data.color !== undefined) sets.push(drizzleSql`color = ${data.color}`)
  if (data.sortOrder !== undefined) sets.push(drizzleSql`sort_order = ${data.sortOrder}`)
  if (sets.length === 0) return null

  const setClause = drizzleSql.join(sets, drizzleSql`, `)
  const result = await db.execute(drizzleSql`
    UPDATE knowledge_categories SET ${setClause} WHERE id = ${id}
    RETURNING *
  `)
  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>)
  if (!rows[0]) return null
  return {
    id: rows[0].id as string,
    slug: rows[0].slug as string,
    label: rows[0].label as string,
    icon: rows[0].icon as string,
    color: rows[0].color as string,
    sortOrder: Number(rows[0].sort_order),
    createdAt: rows[0].created_at ? new Date(rows[0].created_at as string).toISOString() : '',
  }
}

export async function deleteCategory(id: string): Promise<{ success: boolean; moved?: number }> {
  // Find the category to get its slug
  const [cat] = await db.select().from(knowledgeCategories).where(eq(knowledgeCategories.id, id))
  if (!cat) return { success: false }
  if (cat.slug === 'genel') return { success: false } // Cannot delete default category

  // Move docs from this category to 'genel'
  const moveResult = await db.execute(drizzleSql`
    UPDATE knowledge_documents SET category = 'genel', updated_at = now()
    WHERE category = ${cat.slug}
  `)
  const movedCount = (moveResult as unknown as { rowCount?: number }).rowCount ?? 0

  await db.delete(knowledgeCategories).where(eq(knowledgeCategories.id, id))
  return { success: true, moved: movedCount }
}

/** Seed default categories if table is empty */
export async function seedCategories(): Promise<void> {
  const existing = await db.select({ id: knowledgeCategories.id }).from(knowledgeCategories).limit(1)
  if (existing.length > 0) return

  for (const cat of DEFAULT_CATEGORIES) {
    await db.insert(knowledgeCategories).values(cat).onConflictDoNothing()
  }
  console.log('[Categories] Varsayılan kategoriler oluşturuldu')
}
