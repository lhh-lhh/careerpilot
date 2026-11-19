import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
});
