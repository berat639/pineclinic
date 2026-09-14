import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY || ''
  if (!/^[a-f\d]{64}$/i.test(raw)) throw new Error('Sunucuda INTEGRATION_ENCRYPTION_KEY (64 hex karakter) tanımlanmalı.')
  return Buffer.from(raw, 'hex')
}
export function sealSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':')
}
export function openSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(':')
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Entegrasyon anahtarı okunamadı.')
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'))
  cipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([cipher.update(Buffer.from(encrypted, 'hex')), cipher.final()]).toString('utf8')
}
