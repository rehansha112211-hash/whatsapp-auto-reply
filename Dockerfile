# ============================================================
# WhatsApp Engine Dockerfile — Node.js with tsx
# Baileys needs Node.js WebSocket (Bun's is incomplete).
# ============================================================
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY mini-services/whatsapp-engine/package.json ./
RUN npm install --production && npm install tsx typescript

# Copy the engine source
COPY mini-services/whatsapp-engine/index.ts ./

# Create auth-state directory for Baileys session persistence
RUN mkdir -p /app/auth-state

# Expose port
ENV PORT=3004
EXPOSE 3004

# Start with Node.js + tsx (NOT bun — bun's WebSocket crashes Baileys)
CMD ["npx", "tsx", "index.ts"]
