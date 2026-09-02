import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
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

// Content scripts in Manifest V3 must be self-contained. Vite outputs ES
// module chunks for shared code, but Chrome content scripts load as classic
// scripts unless "type": "module" is explicitly set. To avoid
// "Cannot use import statement outside a module" errors we inline all
// local chunk imports into contentScript.js as a single self-contained file.
function inlineContentScript() {
  return {
    name: "inline-content-script",
    apply: "build",
    closeBundle() {
      const distDir = resolve(__dirname, "dist", "assets");
      const mainPath = resolve(distDir, "contentScript.js");
      let code = readFileSync(mainPath, "utf8");

      // Match import statements: import X from "./m"; import {X,Y} from "./m"; import "./m";
      const importRegex = /import\b(?:[^'";]*?\bfrom\s*)?["']((\.\.?\/[^"']+))["'];?/g;

      // Strip ES module import/export statements from inlined chunk code
      // since content scripts run as classic scripts.
      const stripModuleSyntax = (chunkCode) => {
        let cleaned = chunkCode;
        // Remove export statements: export{a,o as i} from "...";  export { x };  export default x;
        cleaned = cleaned.replace(/export\s*[^;{}]*;/g, "");
        cleaned = cleaned.replace(/export\s*\{[^}]*\};?/g, "");
        cleaned = cleaned.replace(/export\s+\{/g, "{");
        // Remove any remaining import statements in the chunk
        cleaned = cleaned.replace(/import\b[^;]*;/g, "");
        return cleaned;
      };

      let changed = true;
      while (changed) {
        changed = false;
        importRegex.lastIndex = 0;
        const match = importRegex.exec(code);
        if (!match) break;

        const modulePath = match[1].trim();
        if (!modulePath.startsWith("./")) continue;

        // The import path may or may not include .js extension
        const candidatePaths = [
          resolve(distDir, modulePath),
          resolve(distDir, modulePath + ".js"),
        ];

        for (const chunkPath of candidatePaths) {
          try {
            const chunkCode = readFileSync(chunkPath, "utf8");
            code = code.replace(match[0], "");
            code = stripModuleSyntax(chunkCode) + "\n" + code;
            changed = true;
            break;
          } catch {
            // Try next candidate path
          }
        }
      }

      writeFileSync(mainPath, code, "utf8");
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest(), inlineContentScript()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
        serviceWorker: resolve(__dirname, "src/background/serviceWorker.js"),
        contentScript: resolve(__dirname, "src/content/contentScript.js"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
