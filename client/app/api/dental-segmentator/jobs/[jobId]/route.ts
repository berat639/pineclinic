import { NextRequest, NextResponse } from 'next/server'
import { hasAuthenticatedSession } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const serviceUrl = () => (process.env.DENTAL_SEGMENTATOR_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  if (!(await hasAuthenticatedSession(request))) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  try {
    const { jobId } = await context.params
    const response = await fetch(`${serviceUrl()}/v1/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
    return new NextResponse(await response.text(), { status: response.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  } catch (error) {
    console.error('[DentalSegmentator job proxy]', error)
    return NextResponse.json({ error: 'DentalSegmentator işi okunamadı.' }, { status: 503 })
  }
}
