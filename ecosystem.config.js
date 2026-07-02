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
      args: "start -p 3000",
      cwd: "C:/Users/zhuma/projects/it-inventory/frontend",
      interpreter: "node",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
