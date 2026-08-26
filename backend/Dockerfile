FROM node:20-alpine AS builder
WORKDIR /app
# .npmrc обязателен: в нём legacy-peer-deps с объяснением, зачем он нужен.
# Без него установка падает с ERESOLVE на опциональном peer ioredis у typeorm.
COPY package*.json .npmrc ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache postgresql-client

COPY package*.json .npmrc ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads /app/backups && \
    chown -R node:node /app

USER node
# Внутри контейнера слушать localhost нельзя — до сервиса не достучатся
# ни другие контейнеры, ни проброс портов. Приложение по умолчанию
# привязано к 127.0.0.1 (см. main.ts), поэтому здесь адрес задан явно
ENV HOST=0.0.0.0

EXPOSE 3001

# Готовность проверяем по /health/ready — он подтверждает и живое соединение с БД,
# а не только то, что процесс поднялся.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
