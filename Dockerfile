FROM oven/bun:1.3.14-slim AS bun-runtime

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update \
    && apt-get install --yes --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
RUN cd node_modules/better-sqlite3 \
    && node /app/node_modules/node-gyp/bin/node-gyp.js rebuild --release --force_build=1 --nodedir=/usr/local \
    && rm -f prebuilds/linux-*.node

FROM dependencies AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN APP_SECRET=folio-build-only-secret-not-used-at-runtime \
    DATABASE_DIALECT=sqlite \
    DATABASE_URL=:memory: \
    bun run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_DIALECT=sqlite
ENV FOLIO_DATA_DIR=/data

LABEL org.opencontainers.image.title="Folio" \
      org.opencontainers.image.description="Self-hosted invoicing" \
      org.opencontainers.image.licenses="MIT"

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000

CMD ["node", "server.js"]
