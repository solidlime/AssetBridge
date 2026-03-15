import { loadEnv } from "./env";
import { workerLoop } from "./worker";

loadEnv();

console.log("[crawler] AssetBridge v2 Crawler starting...");
workerLoop().catch((e: unknown) => {
  console.error("[crawler] Fatal error:", e);
  process.exit(1);
});
