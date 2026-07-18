// ============================================================
// Webhook dispatcher — fires outbound event payloads to external
// HTTP endpoints (Zapier / n8n / Make.com / Slack / custom).
//
// Each delivery is signed with HMAC-SHA256 using the webhook's
// secret. The signature is sent in the `X-QorvixNode-Signature`
// header (hex-encoded) so receivers can verify authenticity.
//
// This module MUST be side-effect safe: webhook failures never
// throw into the caller — they are caught, logged, and recorded
// as a WebhookDelivery row with status=failed.
// ============================================================
import { db } from '@/lib/db'

export const WEBHOOK_SIGNATURE_HEADER = 'X-QorvixNode-Signature'
export const WEBHOOK_TIMEOUT_MS = 10_000

// All events this dispatcher can fire. Keep in sync with
// WEBHOOK_EVENTS in src/lib/types.ts.
export const SUPPORTED_EVENTS = [
  'message.received',
  'message.sent',
  'lead.created',
  'lead.hot',
  'owner.requested',
  'ai.error',
  'contact.created',
  'whatsapp.connected',
  'whatsapp.disconnected',
] as const

export type SupportedWebhookEvent = (typeof SUPPORTED_EVENTS)[number]

export interface WebhookPayload {
  event: string
  timestamp: string
  data: unknown
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function parseEvents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    if (Array.isArray(parsed)) {
      return parsed.filter((e): e is string => typeof e === 'string')
    }
  } catch {
    /* ignore malformed JSON */
  }
  return []
}

function maskUrl(url: string): string {
  // Don't log full URLs (may contain tokens) — keep host + path only.
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return url.slice(0, 64)
  }
}

async function computeSignature(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const bytes = new Uint8Array(sig)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n)
}

// ------------------------------------------------------------
// Core: deliver a single payload to a single webhook.
// Records a WebhookDelivery row with the result.
// Never throws.
// ------------------------------------------------------------
async function deliverOnce(
  webhook: { id: string; url: string; secret: string },
  event: string,
  payload: WebhookPayload,
): Promise<void> {
  const bodyStr = JSON.stringify(payload)
  const signature = await computeSignature(webhook.secret, bodyStr)

  // Use AbortController for a hard timeout. We don't depend on
  // Node's fetch timeout support for portability.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  let statusCode = 0
  let responseSnippet = ''
  let delivered = false

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'QorvixNode-Webhook/1.0',
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body: bodyStr,
      signal: controller.signal,
      // Don't follow redirects silently — record them.
      redirect: 'manual',
    })
    statusCode = res.status
    delivered = res.ok
    try {
      const txt = await res.text()
      responseSnippet = truncate(txt, 500)
    } catch {
      responseSnippet = ''
    }
  } catch (err) {
    statusCode = 0
    responseSnippet = truncate(
      err instanceof Error ? err.message : String(err),
      500,
    )
    delivered = false
  } finally {
    clearTimeout(timer)
  }

  try {
    await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: bodyStr,
        status: delivered ? 'delivered' : 'failed',
        statusCode,
        response: responseSnippet,
        attempts: 1,
        deliveredAt: delivered ? new Date() : null,
      },
    })
  } catch {
    /* DB write failure must not propagate either */
  }
}

// ------------------------------------------------------------
// Public: dispatch an event to all matching active webhooks.
// Fire-and-forget — caller does NOT need to await this.
// Returns a promise that always resolves (never rejects).
// ------------------------------------------------------------
export function dispatchWebhooks(event: string, data: unknown): Promise<void> {
  // Wrap in an immediately-invoked async function so any
  // unexpected error is contained.
  return (async () => {
    try {
      const isSupported = (SUPPORTED_EVENTS as readonly string[]).includes(event)
      // Even if the event isn't in SUPPORTED_EVENTS we still
      // attempt dispatch — this keeps the API forward-compatible
      // with custom user-defined events in the future. The
      // `isSupported` flag is reserved for future telemetry.
      void isSupported

      const webhooks = await db.webhook.findMany({
        where: { isActive: true },
        select: { id: true, url: true, secret: true, events: true },
      })

      const matching = webhooks.filter((w) => {
        const events = parseEvents(w.events)
        // Empty events array = subscribe to all events.
        return events.length === 0 || events.includes(event)
      })

      if (matching.length === 0) return

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      }

      // Fan out concurrently. Each deliverOnce swallows its own
      // errors and records them as failed deliveries.
      await Promise.allSettled(
        matching.map((w) => deliverOnce(w, event, payload)),
      )

      // Lightweight audit log (best-effort).
      try {
        await db.log.create({
          data: {
            category: 'backend',
            level: 'info',
            message: `Webhook event "${event}" dispatched to ${matching.length} endpoint${matching.length === 1 ? '' : 's'}`,
            meta: JSON.stringify({
              event,
              endpoints: matching.map((w) => maskUrl(w.url)),
            }),
          },
        })
      } catch {
        /* ignore */
      }
    } catch {
      // Hard guarantee: never throw.
    }
  })()
}
