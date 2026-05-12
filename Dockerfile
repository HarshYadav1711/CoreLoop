# syntax=docker/dockerfile:1.7

# CoreLoop — production image.
# Builds the Next.js app as a standalone bundle and runs it on a slim
# Node + Python runtime as a non-root user.

ARG NODE_VERSION=22-bookworm-slim

# ---------- deps ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- builder ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runner ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PYTHON_BIN=python3

# Python is required at runtime to execute submitted code.
# tini is added as PID 1 so killed Python subprocesses are reaped cleanly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 coreloop \
 && useradd  --system --uid 1001 --gid coreloop --home /app --shell /usr/sbin/nologin coreloop

COPY --from=builder --chown=coreloop:coreloop /app/public ./public
COPY --from=builder --chown=coreloop:coreloop /app/.next/standalone ./
COPY --from=builder --chown=coreloop:coreloop /app/.next/static ./.next/static

USER coreloop
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
