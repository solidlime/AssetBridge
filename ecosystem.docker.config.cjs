/**
 * PM2 Ecosystem Configuration for Docker
 * 
 * This configuration uses Node.js + tsx instead of Bun for better Docker compatibility.
 * All TypeScript files are executed via tsx runtime.
 */

module.exports = {
  apps: [
    {
      name: "api",
      script: "apps/api/src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: {
        PORT: 8000,
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL || "/app/data/assetbridge_v2.db",
      },
      log_file: "logs/api.log",
      error_file: "logs/api.error.log",
      out_file: "logs/api.out.log",
      max_memory_restart: "500M",
    },
    {
      name: "mcp",
      script: "apps/mcp/src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: {
        PORT: 8001,
        NODE_ENV: "production",
        API_KEY: process.env.API_KEY || "test",
        API_URL: process.env.API_URL || "http://localhost:8000",
      },
      log_file: "logs/mcp.log",
      error_file: "logs/mcp.error.log",
      out_file: "logs/mcp.out.log",
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
        API_KEY: process.env.API_KEY || "test",
        API_URL: process.env.API_URL || "http://localhost:8000",
      },
      log_file: "logs/web.log",
      error_file: "logs/web.error.log",
      out_file: "logs/web.out.log",
    },
    {
      name: "worker",
      script: "apps/crawler/src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL || "/app/data/assetbridge_v2.db",
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium-browser",
      },
      log_file: "logs/worker.log",
      error_file: "logs/worker.error.log",
      out_file: "logs/worker.out.log",
      max_memory_restart: "500M",
    },
    {
      name: "discord",
      script: "apps/discord-bot/src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      autorestart: false,
      env: {
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL || "/app/data/assetbridge_v2.db",
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
      },
      log_file: "logs/discord.log",
      error_file: "logs/discord.error.log",
      out_file: "logs/discord.out.log",
    },
  ],
};
