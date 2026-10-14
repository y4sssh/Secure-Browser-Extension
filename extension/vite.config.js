import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build as bundle } from "rolldown";
import { defineConfig } from "vite";

function copyManifest() {
  return {
    name: "copy-extension-manifest",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      mkdirSync(distDir, { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(distDir, "manifest.json"));
    },
  };
}

// Content scripts in Manifest V3 must be self-contained classic scripts.
// Bundling it as an IIFE preserves each module's scope. The old approach
// concatenated minified chunks, allowing their short internal names to clash
// at runtime (for example, "i is not a function").
function bundleContentScript() {
  return {
    name: "bundle-content-script",
    apply: "build",
    async closeBundle() {
      const distDir = resolve(__dirname, "dist", "assets");
      await bundle({
        input: resolve(__dirname, "src/content/contentScript.js"),
        output: {
          file: resolve(distDir, "contentScript.js"),
          format: "iife",
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest(), bundleContentScript()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
        serviceWorker: resolve(__dirname, "src/background/serviceWorker.js"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
