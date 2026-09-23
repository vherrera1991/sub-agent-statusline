import { solidPlugin } from "esbuild-plugin-solid";
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      runtime: "src/runtime.ts",
    },
    format: ["esm"],
    target: "node22",
    dts: {
      entry: {
        index: "src/index.ts",
        runtime: "src/runtime.ts",
      },
    },
    bundle: true,
    splitting: false,
    clean: true,
    outDir: "dist",
    external: [
      "@opencode-ai/plugin",
      "@opencode-ai/plugin/tui",
      "@opentui/core",
      "@opentui/solid",
      "solid-js",
    ],
  },
  {
    entry: {
      tui: "src/tui.tsx",
    },
    format: ["esm"],
    target: "node22",
    dts: {
      entry: {
        tui: "src/tui.tsx",
      },
    },
    bundle: true,
    splitting: false,
    clean: false,
    outDir: "dist",
    external: [
      "@opencode-ai/plugin",
      "@opencode-ai/plugin/tui",
      "@opentui/core",
      "@opentui/solid",
      "solid-js",
    ],
    esbuildPlugins: [
      solidPlugin({ solid: { generate: "universal", moduleName: "@opentui/solid" } }),
    ],
  },
]);
