import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: resolve(process.cwd(),"public"),
  resolve: {
    alias: { "@": resolve(process.cwd(),"src") },
  },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  clearScreen: false,
});
