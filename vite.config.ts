import { defineConfig } from "vite";
import livePreview from "vite-live-preview";

export default defineConfig({
  plugins: [livePreview({ reload: true, config: { build: { sourcemap: true } } })],
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
