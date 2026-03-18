const BUN = process.env.BUN_PATH ?? "bun";

module.exports = {
  apps: [
    {
      name: "api",
      script: "apps/api/src/index.ts",
      interpreter: BUN,
      env: {
        PORT: 8000,
        NODE_ENV: "production",
      },
      log_file: "logs/api.log",
      error_file: "logs/api.error.log",
      max_memory_restart: "500M",
    },
    {
      name: "mcp",
      script: "apps/mcp/src/index.ts",
      interpreter: BUN,
      env: {
        PORT: 8001,
        NODE_ENV: "production",
      },
      log_file: "logs/mcp.log",
      error_file: "logs/mcp.error.log",
    },
    {
      name: "web",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "apps/web",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        API_KEY: "test",
        API_URL: "http://localhost:8000",
      },
      log_file: "logs/web.log",
      error_file: "logs/web.error.log",
    },
    {
      name: "worker",
      script: "apps/crawler/src/index.ts",
      interpreter: BUN,
      env: {
        NODE_ENV: "production",
      },
      log_file: "logs/worker.log",
      error_file: "logs/worker.error.log",
      max_memory_restart: "500M",
    },
    {
      name: "discord",
      script: "apps/discord-bot/src/index.ts",
      interpreter: BUN,
      autorestart: false,
      env: {
        NODE_ENV: "production",
      },
      log_file: "logs/discord.log",
      error_file: "logs/discord.error.log",
    },
  ],
};
