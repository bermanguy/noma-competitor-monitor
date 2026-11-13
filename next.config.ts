import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["jsdom", "playwright-core", "postgres"],
  experimental: {
    // The proxy buffers request bodies up to this size (10 MB by default). A problem report can carry a 25 MB video.
    proxyClientMaxBodySize: "30mb",
  },
};
export default nextConfig;
