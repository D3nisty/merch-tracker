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

# Maintenance scripts (admin password reset, etc.). They import `better-sqlite3`
# as a normal package so it must be resolvable from /app/node_modules. Instead
# of re-compiling (~10 min on Alpine since better-sqlite3 has no musl prebuild),
# copy the already-compiled module + its small runtime dep tree from the
# builder stage. Node versions match across stages so the .node binary works.
COPY scripts ./scripts
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

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
