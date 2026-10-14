import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), ...(process.env.DECK_TEST_BRIDGE === "1" ? [{
    name: "native-verification-bridge", apply: "serve" as const,
    transformIndexHtml: () => [{ tag: "script", injectTo: "head-prepend" as const, children: `window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const result = await fetch('/__native_test/ipc', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,args})}).then(r=>r.json()); if(!result.ok)throw new Error(result.error); return result.data; } };` }],
  }] : [])],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: process.env.DECK_TEST_BRIDGE === "1" ? { "/__native_test": { target: "http://127.0.0.1:47831", rewrite: (p) => p.replace("/__native_test", "") } } : undefined,
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
});
