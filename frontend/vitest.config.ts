import { defineConfig, mergeConfig, type ConfigEnv } from "vitest/config";
import viteConfig from "./vite.config";

// Reuse the app's vite config (plugins: vue + @intlify i18n + tailwind, and the
// `@` path alias) so test files transform exactly like the dev server does —
// then layer the test settings on top. A jsdom environment + a small global
// shim cover the handful of modules that read `window` at import time.
const env: ConfigEnv = { command: "serve", mode: "test" };

export default mergeConfig(
  viteConfig(env),
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  })
);
