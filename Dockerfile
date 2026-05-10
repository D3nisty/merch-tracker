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

# Runtime libs needed by the pre-compiled better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

# Keep WORKDIR at /app so relative paths (e.g. ./data/merch-tracker.db) resolve
# to /app/data — which matches the docker-compose volume mount.
WORKDIR /app

COPY --from=builder /app/.output ./.output

# Pre-create the directories that will be bind-mounted at runtime so Docker
# doesn't create them as root-owned directories before the mount happens.
RUN mkdir -p /app/uploads /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Run from /app so that:
#   ./data/merch-tracker.db  → /app/data/   (mounted volume)
#   /app/uploads             → /app/uploads  (mounted volume, served via publicAssets)
CMD ["node", ".output/server/index.mjs"]
