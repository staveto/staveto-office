import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/workspace/**/*.test.ts",
      "src/lib/market/**/*.test.ts",
      "src/lib/quotes/**/*.test.ts",
      "src/lib/documents/**/*.test.ts",
      "src/lib/agent/**/*.test.ts",
      "src/lib/enabledWorkTypes.test.ts",
      "src/lib/ai/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
