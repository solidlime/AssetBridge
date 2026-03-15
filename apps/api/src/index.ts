import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router/index";
import { isValidApiKey } from "./middleware/auth";
import type { Context } from "./trpc";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
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

export default {
  port,
  fetch: app.fetch,
};
