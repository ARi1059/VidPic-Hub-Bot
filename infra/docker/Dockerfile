FROM node:26-alpine AS builder

RUN npm install --global pnpm@9.15.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:26-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
RUN addgroup -S filmbot && adduser -S -G filmbot filmbot && chown -R filmbot:filmbot /app
USER filmbot
CMD ["node", "apps/api/dist/main.js"]

FROM node:26-alpine AS bot-worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
RUN addgroup -S filmbot && adduser -S -G filmbot filmbot && chown -R filmbot:filmbot /app
USER filmbot
CMD ["node", "apps/bot-worker/dist/main.js"]

FROM builder AS migrate
ENV NODE_ENV=production
RUN addgroup -S filmbot && adduser -S -G filmbot filmbot
USER filmbot
CMD ["pnpm", "--filter", "@film-bot/database", "db:migrate"]

FROM caddy:2.10-alpine AS web
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/mini-app/dist /srv/mini-app
COPY --from=builder /app/apps/admin/dist /srv/admin
