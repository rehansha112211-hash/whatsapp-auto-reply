# ============================================================
# WhatsApp Engine Dockerfile — Bun runtime
# Uses Bun for fast TypeScript execution.
# ============================================================
FROM oven/bun:1.1

WORKDIR /app

# Copy package files and install dependencies
COPY mini-services/whatsapp-engine/package.json ./
COPY mini-services/whatsapp-engine/bun.lock* ./
RUN bun install

# Copy the engine source
COPY mini-services/whatsapp-engine/index.ts ./

# Create auth-state directory for Baileys session persistence
RUN mkdir -p /app/auth-state

# Expose port
ENV PORT=3004
EXPOSE 3004

# Start the engine
CMD ["bun", "run", "index.ts"]
