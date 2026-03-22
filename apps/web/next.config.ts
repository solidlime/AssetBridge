import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_API_KEY: process.env.NEXT_PUBLIC_API_KEY || "",
  },
  // スタティックエクスポート時はリダイレクト非対応のためスキップ
  ...(!isStaticExport && {
    async redirects() {
      return [
        {
          source: "/credit",
          destination: "/withdrawals",
          permanent: true,
        },
        {
          source: "/income-expense",
          destination: "/",
          permanent: true,
        },
      ];
    },
  }),
};

export default nextConfig;
