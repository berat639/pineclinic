import { existsSync, createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'

const ALLOWED_INSTALLERS: Record<string, { mime: string; releaseUrl: string }> = {
  'PineClinic-Lokal-Servisler.dmg': {
    mime: 'application/x-apple-diskimage',
    releaseUrl:
      process.env.CBCT_MAC_RELEASE_URL ||
      'https://github.com/berat639/pineclinic/releases/download/cbct-v1.0.0/PineClinic-Lokal-Servisler.dmg',
  },
  'PineClinic-Lokal-Servisler-Setup.exe': {
    mime: 'application/vnd.microsoft.portable-executable',
    releaseUrl:
      process.env.CBCT_WIN_RELEASE_URL ||
      'https://github.com/berat639/pineclinic/releases/download/cbct-v1.0.0/PineClinic-Lokal-Servisler-Setup.exe',
  },
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<Response> {
  const { filename } = await context.params
  const entry = ALLOWED_INSTALLERS[filename]
  if (!entry) {
    return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
  }

  // 1) Sunucu diskinde (`public/downloads/`) dosya mevcutsa doğrudan stream et
  const localCandidates = [
    path.join(process.cwd(), 'public', 'downloads', filename),
    path.join(process.cwd(), 'client', 'public', 'downloads', filename),
  ]
  for (const candidate of localCandidates) {
    if (existsSync(candidate)) {
      try {
        const stat = statSync(candidate)
        if (stat.isFile() && stat.size > 0) {
          const nodeStream = createReadStream(candidate)
          const webStream = Readable.toWeb(nodeStream) as ReadableStream
          return new Response(webStream, {
            status: 200,
            headers: {
              'Content-Type': entry.mime,
              'Content-Length': String(stat.size),
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
      } catch {
        // Disk okuma hatasında GitHub Release CDN yedeğine yönlendir
      }
    }
  }

  // 2) Bulut / Docker ortamında GitHub Release CDN adresine yönlendir (302)
  return NextResponse.redirect(entry.releaseUrl, 302)
}
