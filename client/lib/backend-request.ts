function backendBaseUrls(): string[] {
  return [
    process.env.BACKEND_PROXY_URL,
    process.env.SERVER_URL,
    'http://voiceai-server:3001',
    'http://server:3001',
  ].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index)
}

export async function fetchBackend(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown

  for (const baseUrl of backendBaseUrls()) {
    try {
      return await fetch(`${baseUrl}${path}`, init)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Backend service is unavailable')
}
