# syntax=docker/dockerfile:1.6

# ─── Stage 1: build the static frontend with Vite ────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /build/client

# Install client deps from manifest first to leverage layer cache
COPY client/package.json client/package-lock.json* ./
RUN npm install --no-audit --no-fund

# Build
COPY client/ ./
# vite.config.ts writes to ../dist (i.e. /build/dist)
RUN npm run build


# ─── Stage 2: install server deps in a clean Node image ──────────────────────
FROM node:20-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund


# ─── Stage 3: runtime — Node + Redis + supervisord in a single Alpine image ─
FROM node:20-alpine AS runtime

# redis-server, supervisord, and tini (PID 1) for clean signal handling.
# vips is the native dep behind `sharp` (used to resize/transcode profile pictures).
RUN apk add --no-cache redis supervisor tini vips \
 && mkdir -p /data /data/media /etc/redis /app/server /app/dist /run

# Copy server runtime
COPY server/ /app/server/
COPY --from=server-deps /app/server/node_modules /app/server/node_modules

# Copy built static frontend
COPY --from=client-build /build/dist /app/dist

# Configs
COPY redis.conf /etc/redis/redis.conf
COPY supervisord.conf /etc/supervisord.conf

ENV NODE_ENV=production \
    PORT=3001 \
    REDIS_URL=redis://127.0.0.1:6379 \
    STATIC_DIR=/app/dist \
    MEDIA_DIR=/data/media \
    ADMIN_PASSWORD=family123

EXPOSE 3001

# tini cleans up zombies and forwards signals to supervisord, which runs Redis + Express
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
