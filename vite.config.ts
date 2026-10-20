import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 本 worktree 内 vendored（MIT）——共享 node_modules 是主线的 junction，不能往里装包
      "three.quarks": fileURLToPath(new URL("./vendor/three.quarks/three.quarks.esm.js", import.meta.url)),
      "quarks.core": fileURLToPath(new URL("./vendor/quarks.core/quarks.core.esm.js", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          three: [
            "three",
            "three-mesh-bvh",
            "@react-three/fiber",
            "@react-three/drei",
            "@react-three/postprocessing",
            "postprocessing",
          ],
        },
      },
    },
  },
});
