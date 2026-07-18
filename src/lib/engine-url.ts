// ============================================================
// WhatsApp Engine URL — configurable via environment variable.
// On local dev: defaults to 
// On Vercel: set ENGINE_URL env var to the public engine URL
// (e.g. https://your-engine.onrender.com or https://your-tunnel.trycloudflare.com)
// ============================================================
export const ENGINE_URL = process.env.ENGINE_URL || ''
