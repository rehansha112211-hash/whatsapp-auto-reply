// ============================================================
// war-realtime — WebSocket mini-service for the WhatsApp AI
// Auto Reply dashboard. Listens on port 3003 (hardcoded).
//
// Responsibilities:
//   1. Accept socket.io client connections from the dashboard.
//   2. Emit a `dashboard:tick` event every 3s so views can refresh.
//   3. Expose an internal HTTP endpoint `POST /broadcast` that
//      Next.js API routes can call to push real-time events to
//      every connected client (e.g. new message, owner request).
// ============================================================
import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
// Note: do NOT set `path: '/'` here — that would make socket.io intercept
// every HTTP route (including /broadcast and /health). Default path is
// `/socket.io`, which leaves the rest of the URL space free for our HTTP
// handlers below.
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const connectedClients = new Set<string>()

io.on('connection', (socket) => {
  connectedClients.add(socket.id)
  socket.emit('hello', { ok: true })
  io.emit('clients:count', { count: connectedClients.size })

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id)
    io.emit('clients:count', { count: connectedClients.size })
  })
})

// Internal broadcast endpoint — API routes POST here to fan-out events
// to every connected dashboard client.
httpServer.on('request', (req, res) => {
  // Skip socket.io's own traffic (it has its own request listener attached
  // to the same server) so we never try to write to an already-closed
  // response.
  if (req.url && req.url.startsWith('/socket.io')) return
  // If something else already wrote a response (defensive), bail out.
  if (res.writableEnded) return

  if (req.method === 'POST' && req.url === '/broadcast') {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let parsed: { event?: string; payload?: unknown } = {}
      try {
        parsed = raw ? (JSON.parse(raw) as typeof parsed) : {}
      } catch {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: 'invalid json' }))
        return
      }
      const event = parsed.event
      if (!event || typeof event !== 'string') {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: 'missing event' }))
        return
      }
      io.emit(event, parsed.payload ?? null)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          delivered: connectedClients.size,
          event,
        }),
      )
    })
    return
  }

  // Lightweight health endpoint for ops checks
  if (req.method === 'GET' && req.url === '/health') {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        ok: true,
        service: 'war-realtime',
        clients: connectedClients.size,
        uptime: process.uptime(),
      }),
    )
    return
  }

  res.statusCode = 404
  res.end()
})

// Heartbeat — every 3s push a tick to all clients so dashboards can
// re-fetch their data and stay in sync.
setInterval(() => {
  io.emit('dashboard:tick', { ts: Date.now() })
}, 3000)

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[realtime] :${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[realtime] SIGTERM, shutting down')
  io.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[realtime] SIGINT, shutting down')
  io.close(() => process.exit(0))
})
