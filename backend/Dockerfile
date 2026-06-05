FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache postgresql-client

COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads /app/backups && \
    chown -R node:node /app

USER node
EXPOSE 3001
CMD ["node", "dist/main"]
