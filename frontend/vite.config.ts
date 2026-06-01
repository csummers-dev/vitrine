import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import legacy from "@vitejs/plugin-legacy";
import { compression } from "vite-plugin-compression2";
import tailwindcss from "@tailwindcss/vite";

const plugins = [
  vue(),
  tailwindcss(),
  VueI18nPlugin({
    include: [path.resolve(__dirname, "./src/i18n/**/*.json")],
  }),
  legacy({
    // defaults already drop IE support
    targets: ["defaults"],
  }),
  compression({ include: /\.js$/, deleteOriginalAssets: false }),
];

const resolve = {
  alias: {
    // vue: "@vue/compat",
    "@/": `${path.resolve(__dirname, "src")}/`,
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  if (command === "serve") {
    return {
      plugins,
      resolve,
      server: {
        proxy: {
          "/api/command": {
            target: "ws://127.0.0.1:8080",
            ws: true,
          },
          "/api": "http://127.0.0.1:8080",
        },
      },
    };
  } else {
    // command === 'build'
    return {
      plugins,
      resolve,
      base: "",
      build: {
        // The few chunks that exceed this are intentional and acceptable:
        //   - "icons": the full lucide-vue-next set is imported wholesale by
        //     Icon.vue (no tree-shaking, by design) — large but cached forever
        //     since it never changes between app deploys.
        //   - The lazy viewer chunks (VideoViewer/video.js, PdfViewer/pdf.js,
        //     EpubViewer, TextViewer) are only fetched when a user actually
        //     opens that file type, so they don't affect cold-start weight.
        // Raising the limit keeps the build output honest (warnings flag real
        // regressions) without crying wolf over these known-large chunks.
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          input: {
            index: path.resolve(__dirname, "./public/index.html"),
          },
          output: {
            manualChunks: (id) => {
              // Bundle dayjs locale files into one chunk to avoid a swarm of
              // tiny per-locale files (they're imported eagerly at boot).
              if (id.includes("dayjs/")) {
                return "dayjs";
              }
              // Split the big, stable vendor libraries out of the app entry so
              // they cache across deploys (they change far less often than app
              // code) and the main `index` chunk shrinks to just our code.
              if (id.includes("node_modules")) {
                // Full lucide icon set (intentional wholesale `import *` in
                // Icon.vue — the package is published as `@lucide/vue`).
                if (id.includes("@lucide")) {
                  return "icons";
                }
                // Vue runtime + ecosystem used eagerly at boot.
                if (
                  /[\\/]node_modules[\\/](@vue[\\/]|vue[\\/]|vue-router[\\/]|pinia[\\/]|@intlify[\\/]|vue-i18n[\\/])/.test(
                    id
                  )
                ) {
                  return "vue";
                }
              }
              // NOTE: i18n message JSON is intentionally NOT grouped here.
              // src/i18n/*.json are now loaded lazily via import.meta.glob
              // (see src/i18n/index.ts), so letting Rollup code-split one
              // async chunk per locale means a cold start fetches only the
              // fallback ("en") + the active language instead of the old
              // ~840 kB all-locales bundle.
            },
          },
        },
      },
      experimental: {
        renderBuiltUrl(filename, { hostType }) {
          if (hostType === "js") {
            return { runtime: `window.__prependStaticUrl("${filename}")` };
          } else if (hostType === "html") {
            return `[{[ .StaticURL ]}]/${filename}`;
          } else {
            return { relative: true };
          }
        },
      },
    };
  }
});
