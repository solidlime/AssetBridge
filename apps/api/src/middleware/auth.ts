import type { MiddlewareHandler } from "hono";

const API_KEY = process.env.API_KEY ?? "";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header("X-API-Key");
  // API_KEY未設定時は認証失敗にする（dev modeでも認証をバイパスしない）
  if (!isValidApiKey(key)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};

export function isValidApiKey(key: string | undefined): boolean {
  // API_KEY未設定時は認証失敗にする（dev modeでも認証をバイパスしない）
  if (!API_KEY) return false;
  return key === API_KEY;
}
