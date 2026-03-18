/**
 * browser-server.mjs — Node.js で Chromium を起動し wsEndpoint を stdout へ出力する
 * Bun から Bun.spawn() で呼び出し、WebSocket 経由で接続する
 */
import { chromium } from "playwright";

const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";

const server = await chromium.launchServer({
  headless,
  args: ["--no-sandbox"],
});

const endpoint = server.wsEndpoint();
// 親プロセスが 1行読み取れるよう改行付きで出力
process.stdout.write(endpoint + "\n");

// 親プロセス(Bun)が stdin を閉じたらサーバーをシャットダウン
process.stdin.resume();
process.stdin.on("end", async () => {
  await server.close();
  process.exit(0);
});

// 予期しない終了対策
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
