import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { PublisherGithub } from "@electron-forge/publisher-github";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Planbooq",
    appBundleId: "com.planbooq.desktop",
    asar: true,
    icon: "src/renderer/assets/icon",
    protocols: [
      {
        name: "Planbooq",
        schemes: ["planbooq"],
      },
    ],
    // Broker daemon bundle. Shipped outside asar so it can be spawned as a
    // plain CJS file via `process.execPath` with ELECTRON_RUN_AS_NODE=1.
    // Resolved at runtime via process.resourcesPath in broker-client.ts.
    extraResource: ["../broker/dist/broker.cjs"],
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({ format: "ULFO" }),
    new MakerZIP({}, ["darwin"]),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: process.env.GH_REPO_OWNER ?? "jaequery",
        name: process.env.GH_REPO_NAME ?? "planbooq",
      },
      prerelease: false,
      draft: true,
    }),
  ],
};

export default config;
