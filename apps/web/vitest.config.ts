import { defineConfig } from "vitest/config";

import { stylexRenderingPlugin } from "./stylex.js";

export default defineConfig({
  plugins: [stylexRenderingPlugin()],
  test: {
    environment: "node",
    hookTimeout: 30_000,
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
