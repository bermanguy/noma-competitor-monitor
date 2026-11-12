import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Digest time 00:00, so tests that expect a digest pass at any hour of the day, not only after 08:00 local.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, env: { DIGEST_HOUR_LOCAL: "0" } },
});
