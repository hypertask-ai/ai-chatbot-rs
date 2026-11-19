import { foldkit } from "@foldkit/vite-plugin";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

import { siteBasePath } from "./src/site-base-path.js";
import { widgetScriptAssetPath } from "./src/widget/embed.js";
import { widgetLoaderScript } from "./src/widget/loader.js";
import { stylexPlugin } from "./stylex.js";

const outputLayout = (): Plugin => ({
  apply: "build",
  config: (config, environment) => {
    const clientOutDir = config.build?.outDir ?? "dist/client";

    return environment.isSsrBuild === true
      ? {}
      : {
          environments: {
            client: { build: { outDir: clientOutDir } },
            ssr: {
              build: {
                outDir:
                  clientOutDir === "dist/client"
                    ? "dist/server"
                    : `${clientOutDir}/server`,
              },
            },
          },
        };
  },
  name: "site-output-layout",
});

const widgetAssetFileName = widgetScriptAssetPath.replace(/^\//u, "");

const widgetLoaderAsset = (): Plugin => ({
  apply: "build",
  generateBundle() {
    if (this.environment.name !== "client") {
      return;
    }

    this.emitFile({
      fileName: widgetAssetFileName,
      source: widgetLoaderScript(),
      type: "asset",
    });
  },
  name: "site-widget-loader-asset",
});

export default defineConfig({
  base: siteBasePath === "" ? "/" : `${siteBasePath}/`,
  build: {
    rolldownOptions: { external: [/^cloudflare:/u] },
  },
  plugins: [
    stylexPlugin(),
    widgetLoaderAsset(),
    foldkit({
      ssr: {
        build: { prerender: true },
        clientEntry: "/src/client/entry.ts",
        serverEntry: "/src/entry.server.ts",
      },
    }),
    outputLayout(),
  ],
});
