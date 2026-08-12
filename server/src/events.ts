// Shared SSE broadcast store — imported by both index.ts and db.ts
export const sseClients = new Set<(event: string, data: unknown) => void>()
export function broadcastSSE(event: string, data: unknown) {
  sseClients.forEach(send => send(event, data))
}

// User-scoped SSE for notifications
const userSseClients = new Map<string, Set<(data: unknown) => void>>()

export function addUserSseClient(userId: string, send: (data: unknown) => void) {
  if (!userSseClients.has(userId)) userSseClients.set(userId, new Set())
  userSseClients.get(userId)!.add(send)
  return () => {
    userSseClients.get(userId)?.delete(send)
    if (userSseClients.get(userId)?.size === 0) userSseClients.delete(userId)
  }
}

export function sseEmit(userId: string, data: unknown) {
  userSseClients.get(userId)?.forEach(send => send(data))
}
