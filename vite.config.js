var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    plugins: __spreadArray([react()], (process.env.DECK_TEST_BRIDGE === "1" ? [{
            name: "native-verification-bridge", apply: "serve",
            transformIndexHtml: function () { return [{ tag: "script", injectTo: "head-prepend", children: "window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => { const result = await fetch('/__native_test/ipc', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,args})}).then(r=>r.json()); if(!result.ok)throw new Error(result.error); return result.data; } };" }]; },
        }] : []), true),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
        proxy: process.env.DECK_TEST_BRIDGE === "1" ? { "/__native_test": { target: "http://127.0.0.1:47831", rewrite: function (p) { return p.replace("/__native_test", ""); } } } : undefined,
        watch: {
            ignored: ["**/src-tauri/target/**"],
        },
    },
});
