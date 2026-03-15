import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/db/src/schema/index.ts",
  out: "./packages/db/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.ASSETBRIDGE_DB_PATH ?? "./data/assetbridge_v2.db",
  },
} satisfies Config;
