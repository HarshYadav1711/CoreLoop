# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Python is required for real server-side execution. tini keeps subprocess
# cleanup predictable when timed-out Python processes are killed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 coreloop \
 && useradd --system --uid 1001 --gid coreloop --home /app --shell /usr/sbin/nologin coreloop

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=coreloop:coreloop src ./src

USER coreloop
EXPOSE 3001

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
