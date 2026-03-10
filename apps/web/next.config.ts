import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "export" ? "export" : undefined,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_API_KEY: process.env.NEXT_PUBLIC_API_KEY || "",
  },
};

export default nextConfig;
