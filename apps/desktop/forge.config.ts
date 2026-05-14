import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;
const appleId = process.env.APPLE_ID;
const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
const appleTeamId = process.env.APPLE_TEAM_ID;
const canSign = Boolean(signingIdentity);
const canNotarize = canSign && Boolean(appleId && appleIdPassword && appleTeamId);

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
    ...(canSign && {
      osxSign: {
        identity: signingIdentity,
        optionsForFile: () => ({
          hardenedRuntime: true,
          entitlements: "build/entitlements.mac.plist",
          "entitlements-inherit": "build/entitlements.mac.plist",
          "signature-flags": "library",
        }),
      },
    }),
    ...(canNotarize && {
      osxNotarize: {
        appleId: appleId as string,
        appleIdPassword: appleIdPassword as string,
        teamId: appleTeamId as string,
      },
    }),
  },
  rebuildConfig: {},
  makers: [new MakerDMG({ format: "ULFO" }), new MakerZIP({}, ["darwin"])],
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
  // No publishers: CI assembles releases via gh CLI (see
  // .github/workflows/desktop-release.yml). The matrix builds run `make` and
  // upload .dmgs to a pre-created release, sidestepping forge's check-then-
  // create race when two arch jobs publish to the same non-draft release.
};

export default config;
