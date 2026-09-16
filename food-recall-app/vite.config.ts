import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages is served at /beanstalk/. The Android APK copies dist/ into a
// WebView at the origin root, so that build sets VITE_BASE=/.
const pagesBase = process.env.VITE_BASE ?? "/beanstalk/";

export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Beanstalk — FDA and USDA FSIS food recall search",
        short_name: "beanstalk",
        description:
          "Search FDA openFDA and USDA FSIS food recall records by product, company, or hazard. Free to use, with source details and local watchlists.",
        start_url: pagesBase,
        scope: pagesBase,
        theme_color: "#1d4535",
        background_color: "#f8f6ee",
        display: "standalone",
        icons: [
          { src: "icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,ico}"] },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api/food": {
        target: "https://api.fda.gov",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/food/, "/food"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const url = new URL(req.url || "", "https://api.fda.gov");
            const apiKey = process.env.OPENFDA_API_KEY || process.env.VITE_OPENFDA_KEY;
            if (apiKey && !url.searchParams.has("api_key")) {
              const separator = url.search ? "&" : "?";
              proxyReq.path += `${separator}api_key=${apiKey}`;
            }
          });
        },
      },
      "/api/fsis-recalls": {
        target: "https://www.fsis.usda.gov",
        changeOrigin: true,
        rewrite: () => "/fsis/api/recall/v/1",
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
