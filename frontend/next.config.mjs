import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" нужен только для Docker-образа. Локально под PM2 запускается
  // обычный `next start`, с которым standalone-режим конфликтует (ломает /api proxy).
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
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