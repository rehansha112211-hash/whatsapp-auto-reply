// ============================================================
// WhatsApp Engine URL — configurable via environment variable.
// On local dev: defaults to the Caddy gateway on port 81,
// which proxies to the Baileys engine on port 3004.
// On Vercel: set ENGINE_URL env var to the public engine URL
// (e.g. https://your-engine.onrender.com or https://your-tunnel.trycloudflare.com)
// ============================================================

// On the dev server (localhost), we route through the Caddy gateway
// (port 81) using the XTransformPort query parameter so the engine
// is reachable from the Next.js API routes.
const GATEWAY_URL = process.env.NODE_ENV === 'production'
  ? (process.env.ENGINE_URL || '')
  : ''  // In dev, we call the engine directly via localhost:3004

export const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3004'

// Helper: when running on the dev server, we can also reach the engine
// directly. When on Vercel, we use ENGINE_URL.
export function getEngineUrl(): string {
  return ENGINE_URL
}
