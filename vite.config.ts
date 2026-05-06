import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isTest = !!process.env.VITEST;

// Fix HOST override for Shopify CLI
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;

// 🔥 FORZAMOS IPv4 SIEMPRE (solución definitiva)
const hmrConfig = {
  protocol: "ws",
  host: "127.0.0.1",
  port: 64999,
  clientPort: 64999,
  timeout: 120000,
};

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },

    // 🔥 CORRECCIÓN CRÍTICA PARA WINDOWS + CLOUDFLARE
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",

    hmr: hmrConfig,

    fs: {
      allow: ["app", "node_modules"],
    },
  },

  plugins: [
    ...(isTest ? [] : [reactRouter()]),
    tsconfigPaths(),
  ],

  build: {
    assetsInlineLimit: 0,
  },

  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
