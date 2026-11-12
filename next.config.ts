import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["jsdom", "playwright-core", "postgres"],
};
export default nextConfig;
