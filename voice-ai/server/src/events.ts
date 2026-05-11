// Shared SSE broadcast store — imported by both index.ts and db.ts
export const sseClients = new Set<(event: string, data: unknown) => void>()
export function broadcastSSE(event: string, data: unknown) {
  sseClients.forEach(send => send(event, data))
}
