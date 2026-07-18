// ============================================================
// REAL WhatsApp Engine — Baileys Multi-Device
// Project: WhatsApp AI Auto Reply · QorvixNode Technologies
// ============================================================
// This is a REAL WhatsApp connection engine using @whiskeysockets/baileys.
// It runs as a persistent Bun process on port 3004 and exposes an HTTP API
// that the Next.js app calls.
//
// HOW TO USE ON A REAL SERVER (VPS / Termux / Docker):
// 1. cd mini-services/whatsapp-engine && bun install
// 2. bun run dev
// 3. Open the Next.js app → WhatsApp page → scan the REAL QR with your phone
// 4. Messages flow through the real WhatsApp protocol
//
// IN THIS SANDBOX: WhatsApp WebSocket servers (w1.web.whatsapp.com etc.)
// are firewalled, so the connection will fail with a network error.
// The simulation layer in the Next.js app handles this gracefully.
// ============================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAConnectionState,
} from '@whiskeysockets/baileys'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pino from 'pino'

const PORT = 3004
const AUTH_DIR = join(process.cwd(), 'auth-state')
const STATE_FILE = join(process.cwd(), 'wa-state.json')

const __dirname = dirname(fileURLToPath(import.meta.url))

// ============================================================
// State
// ============================================================
interface WAState {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'logged_out'
  qrCode: string
  phoneNumber: string
  userName: string
  connectedAt: string | null
  lastSeen: string
  error: string
}

let state: WAState = {
  connectionState: 'disconnected',
  qrCode: '',
  phoneNumber: '',
  userName: '',
  connectedAt: null,
  lastSeen: new Date().toISOString(),
  error: '',
}

let sock: WASocket | null = null

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function loadState(): WAState | null {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch {
    /* ignore */
  }
  return null
}

// Load persisted state on startup
const persisted = loadState()
if (persisted) {
  state = { ...state, ...persisted, connectionState: 'disconnected', qrCode: '' }
}

// ============================================================
// Incoming message handler — called by Baileys when a real
// WhatsApp message arrives. Forwards it to the Next.js API
// for AI processing.
// ============================================================
async function forwardIncomingMessage(msg: any) {
  try {
    const jid = msg.key.remoteJid
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''

    if (!text || !jid) return
    // Only process private chats (not groups, status, broadcasts)
    if (!jid.endsWith('@s.whatsapp.net')) return

    const phone = jid.split('@')[0]
    const name = msg.pushName || phone

    console.log(`[wa-engine] Incoming from ${name} (${phone}): ${text.slice(0, 80)}`)

    // Forward to Next.js for AI processing
    await fetch('http://localhost:3000/api/whatsapp/incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name, text }),
    })
  } catch (err) {
    console.error('[wa-engine] Failed to forward message:', err)
  }
}

// ============================================================
// Send a message via real WhatsApp
// ============================================================
async function sendMessage(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!sock || state.connectionState !== 'connected') {
    return { ok: false, error: 'WhatsApp not connected' }
  }
  try {
    const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net'
    await sock.sendMessage(jid, { text })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ============================================================
// Start the Baileys connection
// ============================================================
async function startConnection() {
  if (sock) {
    sock.end(undefined)
    sock = null
  }

  state.connectionState = 'connecting'
  state.error = ''
  saveState()

  try {
    // Ensure auth directory exists
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { recursive: true })
    }

    // Use the latest Baileys version
    const { version } = await fetchLatestBaileysVersion()

    // Multi-file auth state — persists session across restarts
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

    // Create the socket
    sock = makeWASocket({
      version,
      auth: authState,
      logger: pino({ level: 'silent' }), // silent — we handle logging ourselves
      printQRInTerminal: false,
      browser: ['QorvixNode WA', 'Chrome', '1.0.0'],
    })

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds)

    // Connection state changes
    sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        state.qrCode = qr
        state.connectionState = 'connecting'
        saveState()
        console.log('[wa-engine] QR code generated — scan with your phone')
      }

      if (connection === 'open') {
        state.connectionState = 'connected'
        state.qrCode = ''
        state.connectedAt = new Date().toISOString()
        state.error = ''
        const user = sock?.user
        if (user) {
          state.phoneNumber = user.id?.split(':')[0] || ''
          state.userName = user.name || user.verifiedName || ''
        }
        saveState()
        console.log(`[wa-engine] ✓ Connected as ${state.phoneNumber} (${state.userName})`)
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        if (statusCode === DisconnectReason.loggedOut) {
          state.connectionState = 'logged_out'
          console.log('[wa-engine] Device logged out — need new QR scan')
        } else {
          state.connectionState = 'disconnected'
          console.log(`[wa-engine] Connection closed (code ${statusCode}), reconnecting: ${shouldReconnect}`)
        }

        state.qrCode = ''
        state.lastSeen = new Date().toISOString()
        state.error = lastDisconnect?.error?.message || ''
        saveState()

        if (shouldReconnect) {
          setTimeout(() => startConnection(), 3000)
        }
      }
    })

    // Incoming messages
    sock.ev.on('messages.upsert', (m: any) => {
      const messages = m.messages || []
      for (const msg of messages) {
        if (msg.key.fromMe) continue // skip outgoing
        forwardIncomingMessage(msg)
      }
    })
  } catch (err) {
    state.connectionState = 'disconnected'
    state.error = (err as Error).message
    saveState()
    console.error('[wa-engine] Failed to start connection:', err)
    // Retry after 5 seconds
    setTimeout(() => startConnection(), 5000)
  }
}

// ============================================================
// HTTP API — the Next.js app calls these
// ============================================================
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url || '', `http://localhost:${PORT}`)
  const path = url.pathname

  // Helper to send JSON
  const sendJSON = (code: number, data: any) => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  // Helper to read request body
  const readBody = (): Promise<string> =>
    new Promise((resolve) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => resolve(body))
    })

  try {
    // GET / — current state
    if (path === '/' && req.method === 'GET') {
      sendJSON(200, state)
      return
    }

    // GET /health
    if (path === '/health' && req.method === 'GET') {
      sendJSON(200, { ok: true, service: 'wa-engine', state: state.connectionState })
      return
    }

    // POST /connect — start/restart connection (generates QR)
    if (path === '/connect' && req.method === 'POST') {
      await startConnection()
      sendJSON(200, { ok: true, message: 'Connecting — QR will appear shortly' })
      return
    }

    // POST /pair-phone — start connection + request pairing code
    // This is WhatsApp's official alternative to QR scanning.
    // User enters their phone number, receives a code via SMS,
    // enters it on their phone's WhatsApp → Linked Devices.
    if (path === '/pair-phone' && req.method === 'POST') {
      const body = JSON.parse(await readBody())
      const phone = (body.phone || '').trim()
      if (!phone || phone.length < 7) {
        sendJSON(400, { error: 'Valid phone number required' })
        return
      }

      // Start the connection if not already started
      if (!sock) {
        await startConnection()
        // Wait for socket to be ready (Baileys needs the connection open
        // before we can request a pairing code)
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      if (!sock) {
        sendJSON(500, { error: 'Engine not ready. Try again in a few seconds.' })
        return
      }

      try {
        // Request pairing code from WhatsApp
        // Phone must be in format: country code + number, no + or spaces
        const cleanPhone = phone.replace(/[^0-9]/g, '')
        console.log(`[wa-engine] Requesting pairing code for ${cleanPhone}...`)

        // Baileys requestPairingCode returns a string like "ABCD-EFGH"
        const code = await sock.requestPairingCode(cleanPhone)
        console.log(`[wa-engine] ✓ Pairing code generated: ${code}`)

        // IMPORTANT: Clear the QR code from state so the UI shows the
        // pairing code screen instead of switching to the QR card.
        state.qrCode = ''
        state.connectionState = 'connecting'
        state.phoneNumber = phone
        saveState()

        sendJSON(200, { ok: true, code, phone })
      } catch (err) {
        console.error('[wa-engine] Pairing code failed:', err)
        sendJSON(500, { error: 'Failed to get pairing code: ' + (err as Error).message })
      }
      return
    }

    // POST /disconnect — disconnect
    if (path === '/disconnect' && req.method === 'POST') {
      if (sock) {
        sock.end(undefined)
        sock = null
      }
      state.connectionState = 'disconnected'
      state.qrCode = ''
      state.connectedAt = null
      state.lastSeen = new Date().toISOString()
      saveState()
      sendJSON(200, { ok: true })
      return
    }

    // POST /logout — full logout (clears auth)
    if (path === '/logout' && req.method === 'POST') {
      if (sock) {
        sock.logout()
        sock = null
      }
      state.connectionState = 'logged_out'
      state.qrCode = ''
      state.phoneNumber = ''
      state.userName = ''
      state.connectedAt = null
      saveState()
      sendJSON(200, { ok: true })
      return
    }

    // POST /send — send a message
    if (path === '/send' && req.method === 'POST') {
      const body = JSON.parse(await readBody())
      const result = await sendMessage(body.phone, body.text)
      sendJSON(result.ok ? 200 : 400, result)
      return
    }

    // POST /incoming-callback — Next.js calls this to relay AI replies back
    // (The Next.js AI pipeline generates a reply, then calls this to send it via real WA)
    if (path === '/send-reply' && req.method === 'POST') {
      const body = JSON.parse(await readBody())
      const result = await sendMessage(body.phone, body.text)
      sendJSON(result.ok ? 200 : 400, result)
      return
    }

    sendJSON(404, { error: 'Not found' })
  } catch (err) {
    console.error('[wa-engine] API error:', err)
    sendJSON(500, { error: (err as Error).message })
  }
})

server.listen(PORT, () => {
  console.log(`\n========================================`)
  console.log(`  REAL WhatsApp Engine (Baileys)`)
  console.log(`  Port: ${PORT}`)
  console.log(`  Auth: ${AUTH_DIR}`)
  console.log(`========================================`)
  console.log(`\n[wa-engine] Waiting for connection request...`)
  console.log('[wa-engine] Call POST http://localhost:3004/connect to start\n')

  // Auto-connect if we have a saved session
  if (existsSync(AUTH_DIR) && existsSync(join(AUTH_DIR, 'creds.json'))) {
    console.log('[wa-engine] Found saved session — auto-connecting...')
    startConnection()
  }

  // ============================================================
  // Keep-alive: self-ping every 5 minutes to prevent the
  // free-tier service from sleeping (Render/Heroku sleep
  // after 15 min of inactivity).
  // ============================================================
  setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`)
      if (res.ok) {
        console.log('[wa-engine] Keep-alive ping OK')
      }
    } catch {
      // ignore
    }
  }, 5 * 60 * 1000) // every 5 minutes

  // ============================================================
  // Global error handlers — prevent crashes from killing
  // the entire process.
  // ============================================================
  process.on('uncaughtException', (err) => {
    console.error('[wa-engine] Uncaught exception:', err.message)
    // Don't exit — try to recover
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[wa-engine] Unhandled rejection:', reason)
    // Don't exit — try to recover
  })
})
