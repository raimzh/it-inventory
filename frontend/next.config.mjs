/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" нужен только для Docker-образа. Локально под PM2 запускается
  // обычный `next start`, с которым standalone-режим конфликтует (ломает /api proxy).
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;