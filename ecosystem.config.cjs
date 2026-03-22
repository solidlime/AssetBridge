const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolveBun() {
  if (process.env.BUN_PATH) return process.env.BUN_PATH;
  if (process.platform === "win32") {
    // bun.cmd / bun.ps1 は PM2 interpreter に使えないため bun.exe を直接探す
    // 1. where.exe bun.exe で探す
    try {
      const result = execSync("where.exe bun.exe 2>NUL", { encoding: "utf-8" }).trim();
      const first = result.split(/\r?\n/)[0];
      if (first && fs.existsSync(first)) return first;
    } catch {}
    // 2. bun.cmd が存在すれば、同じ npm フォルダ配下の bun.exe を探す
    try {
      const bunCmd = execSync("where.exe bun.cmd 2>NUL", { encoding: "utf-8" }).trim().split(/\r?\n/)[0];
      if (bunCmd) {
        const npmDir = path.dirname(bunCmd);
        const bunExe = path.join(npmDir, "node_modules", "bun", "bin", "bun.exe");
        if (fs.existsSync(bunExe)) return bunExe;
      }
    } catch {}
    // 3. npm グローバルの典型的なパス
    const fallback = path.join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      "bun",
      "bin",
      "bun.exe"
    );
    if (fs.existsSync(fallback)) return fallback;
  }
  return "bun";
}

const BUN = resolveBun();

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
        API_KEY: process.env.API_KEY || "test",
        API_URL: process.env.API_URL || "http://localhost:8000",
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
        API_KEY: process.env.API_KEY || "test",
        API_URL: process.env.API_URL || "http://localhost:8000",
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
