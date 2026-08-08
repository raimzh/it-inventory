FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --legacy-peer-deps: typeorm@1.1 объявляет ioredis как опциональный peer
# ^5.0.4 для своего встроенного Redis-кэша, которым проект не пользуется
# (свой CacheService/RedisThrottlerStorage на ioredis 6) — без флага чистая
# установка падает с ERESOLVE на этом единственном несовпадении.
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache postgresql-client

COPY package*.json ./
# --legacy-peer-deps: typeorm@1.1 объявляет ioredis как опциональный peer
# ^5.0.4 для своего встроенного Redis-кэша, которым проект не пользуется
# (свой CacheService/RedisThrottlerStorage на ioredis 6) — без флага чистая
# установка падает с ERESOLVE на этом единственном несовпадении.
RUN npm install --legacy-peer-deps --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads /app/backups && \
    chown -R node:node /app

USER node
EXPOSE 3001

# Готовность проверяем по /health/ready — он подтверждает и живое соединение с БД,
# а не только то, что процесс поднялся.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
