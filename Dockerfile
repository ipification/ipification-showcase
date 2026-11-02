FROM node:24.22.0-bookworm-slim AS dependencies
WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24.22.0-bookworm-slim AS production-dependencies
WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.22.0-bookworm-slim AS runtime
WORKDIR /usr/app
ENV NODE_ENV=production PORT=3002 NEXT_TELEMETRY_DISABLED=1
COPY --from=production-dependencies /usr/app/node_modules ./node_modules
COPY --from=builder /usr/app/.next ./.next
COPY --from=builder /usr/app/public ./public
COPY --from=builder /usr/app/config ./config
COPY --from=builder /usr/app/runtime ./runtime
COPY --from=builder /usr/app/scripts ./scripts
COPY --from=builder /usr/app/server.mjs /usr/app/package.json /usr/app/next.config.ts ./
RUN mkdir -p /run/showcase-config && chown -R node:node /usr/app /run/showcase-config
USER node
EXPOSE 3002
CMD ["node", "server.mjs"]
