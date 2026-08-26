// Боевые процессы. Живут в системном инстансе PM2
// (PM2_HOME=C:\ProgramData\pm2-ktms), поэтому команды pm2 требуют прав
// администратора — см. redeploy.ps1.
//
// Схема портов после подключения HTTPS:
//
//   8443  снаружи   tls-proxy, шифрование        -> 127.0.0.1:3010
//   3000  снаружи   tls-proxy, перенаправление на 8443 (старые закладки)
//   3010  локально  Next.js, в сеть не выставлен
//   3001  локально  NestJS, в сеть не выставлен
//
// Фронтенд намеренно привязан к 127.0.0.1: пока он слушал 0.0.0.0,
// в обход шифрования всегда оставался открытый вход, и HTTPS был
// необязательным. Обратная сторона — если процесс it-inventory-tls не
// поднимется, снаружи не будет доступно НИЧЕГО. Он падает с внятным
// сообщением, только если нет файлов сертификата (certs\server.crt);
// выпускаются они скриптом scripts/make-tls-cert.ps1.
module.exports = {
  apps: [
    {
      name: "it-inventory-backend",
      script: "./dist/main.js",
      cwd: "C:/Users/zhuma/projects/it-inventory/backend",
      interpreter: "node",
      env: { NODE_ENV: "production", PORT: 3001 },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "it-inventory-frontend",
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3010 -H 127.0.0.1",
      cwd: "C:/Users/zhuma/projects/it-inventory/frontend",
      interpreter: "node",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "it-inventory-tls",
      script: "./scripts/tls-proxy.js",
      cwd: "C:/Users/zhuma/projects/it-inventory",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        TLS_PROXY_PORT: 8443,
        TLS_PROXY_REDIRECT_PORT: 3000,
        TLS_PROXY_TARGET_HOST: "127.0.0.1",
        TLS_PROXY_TARGET_PORT: 3010,
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
