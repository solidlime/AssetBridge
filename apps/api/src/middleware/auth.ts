import type { MiddlewareHandler } from "hono";

const API_KEY = process.env.API_KEY ?? "";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header("X-API-Key");
  // If no API_KEY configured, allow all (dev mode)
  if (API_KEY && key !== API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};

export function isValidApiKey(key: string | undefined): boolean {
  if (!API_KEY) return true; // dev mode: no key required
  return key === API_KEY;
}
