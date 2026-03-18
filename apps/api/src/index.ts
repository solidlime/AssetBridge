import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router/index";
import { isValidApiKey } from "./middleware/auth";
import type { Context } from "./trpc";

const app = new Hono();

const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
if (origin === "*") {
  console.warn("[api] WARNING: WEB_ORIGIN=* — all origins allowed, not recommended for production");
}

app.use(
  "*",
  cors({
    origin,
    allowHeaders: ["X-API-Key", "Content-Type"],
  })
);

app.get("/health", (c) => c.json({ status: "ok", version: "2.0.0" }));

// tRPC ハンドラ — /trpc/* 配下の全メソッドを受け付ける
app.all("/trpc/*", (c) => {
  return fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: (): Context => ({
      apiKeyValid: isValidApiKey(c.req.header("X-API-Key")),
    }),
  });
});

const port = parseInt(process.env.PORT ?? "8000", 10);
console.log(`AssetBridge API v2 starting on port ${port}`);

// PM2 + Windows互換のため export default ではなく Bun.serve() で明示的に起動
const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.log(`Server listening on http://0.0.0.0:${server.port}`);
