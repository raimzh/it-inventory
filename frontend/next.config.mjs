import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" нужен только для Docker-образа. Локально под PM2 запускается
  // обычный `next start`, с которым standalone-режим конфликтует (ломает /api proxy).
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  // Каталог сборки. По умолчанию `.next` — тот самый, из которого работающий
  // `next start` отдаёт живой сайт. Поэтому деплой собирает в `.next-staging`
  // (NEXT_DIST_DIR задаётся в redeploy.ps1) и подменяет каталоги готовыми:
  // иначе сборка стирает чанки под ногами у работающего сервера, и всё время
  // сборки сайт отдаёт 500 и битые страницы.
  //
  // ВАЖНО: при запуске (`next start`) переменная должна быть НЕ задана, иначе
  // сервер пойдёт искать сборку в staging-каталоге, которого после подмены
  // уже нет. В redeploy.ps1 она снимается перед обращением к pm2.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // В репозитории есть package-lock.json и в корне, и в frontend/ — без явного
  // корня Turbopack не может однозначно определить workspace root.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;