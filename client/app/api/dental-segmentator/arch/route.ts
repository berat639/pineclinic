import { NextRequest, NextResponse } from 'next/server'
import { hasAuthenticatedSession } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const serviceUrl = () => (process.env.DENTAL_SEGMENTATOR_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function POST(request: NextRequest) {
  if (!(await hasAuthenticatedSession(request))) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter((value): value is File => value instanceof File)
    if (files.length < 16) return NextResponse.json({ error: 'En az 16 DICOM kesiti gönderilmelidir.' }, { status: 400 })
    const outbound = new FormData()
    files.forEach((file) => outbound.append('files', file, file.name || 'slice.dcm'))
    const preferredSlice = form.get('preferred_slice')
    if (typeof preferredSlice === 'string' && preferredSlice) outbound.append('preferred_slice', preferredSlice)
    const response = await fetch(`${serviceUrl()}/v1/arch`, { method: 'POST', body: outbound, cache: 'no-store' })
    return new NextResponse(await response.text(), { status: response.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  } catch (error) {
    console.error('[DentalSegmentator proxy]', error)
    return NextResponse.json({ error: 'DentalSegmentator servisine ulaşılamadı.' }, { status: 503 })
  }
}
