import { defineConfig } from "vite";

// The broker is launched by Electron via `ELECTRON_RUN_AS_NODE=1 electron broker.cjs`,
// so we bundle to a single self-contained CommonJS file with no external deps
// to resolve at runtime. Output lives at apps/broker/dist/broker.cjs and is
// copied into the Electron resources at package time.
export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "broker.cjs",
    },
    rollupOptions: {
      // Node built-ins must stay external; everything else is bundled.
      external: [
        "node:child_process",
        "node:crypto",
        "node:fs",
        "node:fs/promises",
        "node:http",
        "node:net",
        "node:os",
        "node:path",
        "node:url",
        "node:util",
      ],
    },
    target: "node20",
    minify: false,
    sourcemap: true,
  },
});
