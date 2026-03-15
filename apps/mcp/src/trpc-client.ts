import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@assetbridge/api/router";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const API_KEY = process.env.API_KEY ?? "";

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
