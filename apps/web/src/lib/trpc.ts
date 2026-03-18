import { createTRPCClient, httpBatchLink } from "@trpc/client";
// @ts-ignore — @assetbridge/api はビルド後に解決される
import type { AppRouter } from "@assetbridge/api/router";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:8000";

// NEXT_PUBLIC_ プレフィックスがある変数はクライアントサイドでも参照可能
// SERVER: API_KEY / CLIENT: NEXT_PUBLIC_API_KEY の両方を確認
const API_KEY =
  process.env.NEXT_PUBLIC_API_KEY ??
  process.env['API_KEY'] ??
  "";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers: () => ({
        "X-API-Key": API_KEY,
      }),
    }),
  ],
});
