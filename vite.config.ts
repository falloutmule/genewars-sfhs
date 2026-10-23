import { defineConfig } from "vitest/config";
export default defineConfig({
  build: { target: "es2022", sourcemap: false },
  server: { host: "127.0.0.1" },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [".private/**", "node_modules/**"],
    maxWorkers: 2,
    minWorkers: 1,
  },
});
