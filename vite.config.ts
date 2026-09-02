import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import livePreview from "vite-live-preview";

const packageVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

export default defineConfig({
  define: {
    __PENPOT_TO_FLUTTER_VERSION__: JSON.stringify(packageVersion),
  },
  // A preview reload recreates Penpot's plugin execution context and drops its
  // session index. Refresh the plugin deliberately after source changes instead.
  plugins: [livePreview({ reload: false, config: { build: { sourcemap: true } } })],
  build: {
    rollupOptions: {
      input: {
        plugin: "src/plugin.ts",
        index: "./index.html",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
  server: {
    port: 4400,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
    },
  },
  preview: {
    port: 4400,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
    },
    allowedHosts: ["localhost", ".trycloudflare.com", "design.penpot.app"],
  },
});
