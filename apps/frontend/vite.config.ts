import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, "../..");
  const env = { ...loadEnv(mode, repoRoot, ""), ...loadEnv(mode, process.cwd(), "") };
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? "http://127.0.0.1:3099";

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@assistant/shared": path.resolve(
          __dirname,
          "../../packages/shared/src/index.ts",
        ),
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["logo.png"],
        manifest: {
          name: "Smart Assistant",
          short_name: "Smart Assistant",
          description: "Notes, schedule, expenses, AI",
          theme_color: "#0f172a",
          background_color: "#0f172a",
          display: "standalone",
          start_url: "/",
          lang: "vi",
          icons: [
            {
              src: "logo.png",
              sizes: "any",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webp}"],
          navigateFallbackDenylist: [/^\/api/],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      target: "es2022",
    },
  };
});
