import { createI18n } from "vue-i18n";
import en from "./en.json";

/**
 * English is the only supported language.
 *
 * This fork removed the upstream multi-locale machinery — per-locale lazy
 * loading, navigator-based detection, RTL handling, and the in-UI language
 * picker. Those translations were inherited from upstream filebrowser, were
 * inaccurate / incompatible with this fork's reworked UI, and added bundle
 * weight for a feature we don't ship. `en.json` is the single source of truth.
 *
 * `@intlify/unplugin-vue-i18n` precompiles `en.json` into message functions
 * (see its `include` glob in vite.config.ts), so importing it eagerly is cheap.
 */
export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: { en },
  legacy: true,
});

export default i18n;
