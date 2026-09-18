export function normalizeHostname(value: string | null | undefined): string {
  if (!value) return ''
  const first = value.split(',')[0]?.trim().toLowerCase() ?? ''
  const withoutProtocol = first.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  return withoutProtocol.replace(/\.$/, '').replace(/:\d+$/, '')
}

export function hostnameFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host')
  const host = forwarded || request.headers.get('host')
  return normalizeHostname(host)
}
