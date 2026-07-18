# ============================================================
# WhatsApp Engine Dockerfile — for free deployment on
# Render.com, Fly.io, Railway, or any container platform.
# Uses Bun runtime for the Baileys WhatsApp engine.
# ============================================================
FROM oven/bun:1.1 AS base

WORKDIR /app

# Copy package files and install dependencies
COPY mini-services/whatsapp-engine/package.json ./
COPY mini-services/whatsapp-engine/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy the engine source
COPY mini-services/whatsapp-engine/index.ts ./
COPY mini-services/whatsapp-engine/tsconfig.json* ./

# Create auth-state directory for Baileys session persistence
RUN mkdir -p /app/auth-state

# Expose the engine port
ENV PORT=3004
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3004/health || exit 1

# Start the engine
CMD ["bun", "run", "index.ts"]
