# ─── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ─── Stage 2: Runtime ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Re-compile better-sqlite3 for this exact platform/architecture
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/.output ./.output

ENV NODE_ENV=production
EXPOSE 3000

# Create /app/uploads so the volume mount point exists before Docker mounts it.
# Uploads are served via Nitro publicAssets (configured in nuxt.config.ts).
RUN mkdir -p /app/uploads

# Run from inside .output so DB path ./data/merch-tracker.db resolves to .output/data/
WORKDIR /app/.output
CMD ["node", "server/index.mjs"]
