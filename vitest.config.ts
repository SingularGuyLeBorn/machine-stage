import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "three.quarks": fileURLToPath(new URL("./vendor/three.quarks/three.quarks.esm.js", import.meta.url)),
      "quarks.core": fileURLToPath(new URL("./vendor/quarks.core/quarks.core.esm.js", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // 航母 4500+ 件的装配测试内存占用高：单 worker 串行，避免多 worker 触发 V8 Zone OOM。
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx"],
    },
  },
});
