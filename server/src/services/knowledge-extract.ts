/** Yüklenen dosyalardan düz metin çıkarır (txt/md/csv/json, PDF, DOCX). */

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json'])
const TEXT_MIMES = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export class UnsupportedFileError extends Error {}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UnsupportedFileError('Dosya 10 MB sınırını aşıyor.')
  const ext = extensionOf(file.name)
  const mime = (file.type || '').split(';')[0]!.trim().toLowerCase()

  if (TEXT_EXTENSIONS.has(ext) || TEXT_MIMES.includes(mime)) return normalizeText(await file.text())

  if (ext === 'pdf' || mime === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()))
    const { text } = await extractText(pdf, { mergePages: true })
    return normalizeText(Array.isArray(text) ? text.join('\n') : text)
  }

  if (ext === 'docx' || mime === DOCX_MIME) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) })
    return normalizeText(result.value)
  }

  throw new UnsupportedFileError('Desteklenen dosya türleri: .txt, .md, .csv, .json, .pdf, .docx')
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
