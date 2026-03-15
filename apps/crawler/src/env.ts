import { existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";

export function loadEnv(): void {
  const envPaths = [
    process.env.ASSETBRIDGE_ENV_PATH,
    path.join(os.homedir(), ".assetbridge", ".env"),
    path.join(process.cwd(), ".env"),
  ].filter(Boolean) as string[];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx < 0) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        // インラインコメント除去
        value = value.split(/\s+#/)[0].trim();
        // クォート除去
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
      console.log(`[env] Loaded: ${envPath}`);
      break;
    }
  }
}
