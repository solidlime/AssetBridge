import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

export interface Context {
  apiKeyValid: boolean;
}

const t = initTRPC.context<Context>().create();

const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.apiKeyValid) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid API key" });
  }
  return next({ ctx });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const proc = protectedProcedure;
