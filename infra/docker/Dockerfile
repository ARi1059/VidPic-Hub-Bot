FROM node:22-alpine AS builder

RUN npm install --global pnpm@9.15.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
CMD ["node", "apps/api/dist/main.js"]

FROM node:22-alpine AS bot-worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
CMD ["node", "apps/bot-worker/dist/main.js"]

FROM caddy:2.10-alpine AS web
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/mini-app/dist /srv/mini-app
COPY --from=builder /app/apps/admin/dist /srv/admin
