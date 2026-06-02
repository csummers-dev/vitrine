import dayjs from "dayjs";
import { createI18n } from "vue-i18n";

import("dayjs/locale/ar");
import("dayjs/locale/bg");
import("dayjs/locale/ca");
import("dayjs/locale/cs");
import("dayjs/locale/de");
import("dayjs/locale/el");
import("dayjs/locale/en");
import("dayjs/locale/es");
import("dayjs/locale/fr");
import("dayjs/locale/he");
import("dayjs/locale/hr");
import("dayjs/locale/hu");
import("dayjs/locale/is");
import("dayjs/locale/it");
import("dayjs/locale/ja");
import("dayjs/locale/ko");
import("dayjs/locale/lv");
import("dayjs/locale/nb");
import("dayjs/locale/nl");
import("dayjs/locale/nl-be");
import("dayjs/locale/pl");
import("dayjs/locale/pt-br");
import("dayjs/locale/pt");
import("dayjs/locale/ro");
import("dayjs/locale/ru");
import("dayjs/locale/sk");
import("dayjs/locale/sv");
import("dayjs/locale/tr");
import("dayjs/locale/uk");
import("dayjs/locale/vi");
import("dayjs/locale/zh-cn");
import("dayjs/locale/zh-tw");

// Per-locale lazy loading. Previously every locale was bundled eagerly via
// `@intlify/unplugin-vue-i18n/messages`, producing a single ~840 kB chunk
// loaded on every cold start regardless of which language the user actually
// reads. Instead we map each `./<locale>.json` to its own async chunk (Vite
// code-splits one per file) and only fetch the locales we need: the fallback
// ("en") plus the active locale at boot, and any other locale the moment the
// user switches to it. The `@intlify/unplugin-vue-i18n` plugin still
// pre-compiles each JSON because the files match its `include` glob.
const localeLoaders = import.meta.glob<{ default: Record<string, unknown> }>(
  "./*.json"
);

/**
 * Fetch + register a locale's messages if not already loaded. Idempotent and
 * safe to call with an unknown locale (no matching file → no-op, vue-i18n's
 * `fallbackLocale` covers the gap).
 */
export async function loadLocaleMessages(locale: string): Promise<void> {
  if (i18n.global.availableLocales.includes(locale)) return;
  const loader = localeLoaders[`./${locale}.json`];
  if (!loader) return;
  const mod = await loader();
  i18n.global.setLocaleMessage(locale, mod.default);
}

/**
 * Boot-time preload: the fallback locale ("en") plus the active locale, so the
 * very first paint is fully translated. Awaited in main.ts before mount.
 */
export async function ensureInitialLocale(): Promise<void> {
  await Promise.all([
    loadLocaleMessages("en"),
    loadLocaleMessages(detectLocale()),
  ]);
}

export function detectLocale() {
  // locale is an RFC 5646 language tag
  // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/language
  let locale = navigator.language.toLowerCase();
  switch (true) {
    case /^ar\b/.test(locale):
      locale = "ar";
      break;
    case /^bg\b/.test(locale):
      locale = "bg";
      break;
    case /^cs\b/.test(locale):
      locale = "cs";
      break;
    case /^lv\b/.test(locale):
      locale = "lv";
      break;
    case /^he\b/.test(locale):
      locale = "he";
      break;
    case /^hr\b/.test(locale):
      locale = "hr";
      break;
    case /^hu\b/.test(locale):
      locale = "hu";
      break;
    case /^el.*/i.test(locale):
      locale = "el";
      break;
    case /^es\b/.test(locale):
      locale = "es";
      break;
    case /^en\b/.test(locale):
      locale = "en";
      break;
    case /^is\b/.test(locale):
      locale = "is";
      break;
    case /^it\b/.test(locale):
      locale = "it";
      break;
    case /^fr\b/.test(locale):
      locale = "fr";
      break;
    case /^pt-br\b/.test(locale):
      locale = "pt-br";
      break;
    case /^pt-pt\b/.test(locale):
    case /^pt\b/.test(locale):
      locale = "pt-pt";
      break;
    case /^ja\b/.test(locale):
      locale = "ja";
      break;
    case /^zh-tw\b/.test(locale):
      locale = "zh-tw";
      break;
    case /^zh-cn\b/.test(locale):
    case /^zh\b/.test(locale):
      locale = "zh-cn";
      break;
    case /^de\b/.test(locale):
      locale = "de";
      break;
    case /^ro\b/.test(locale):
      locale = "ro";
      break;
    case /^ru\b/.test(locale):
      locale = "ru";
      break;
    case /^pl\b/.test(locale):
      locale = "pl";
      break;
    case /^ko\b/.test(locale):
      locale = "ko";
      break;
    case /^sk\b/.test(locale):
      locale = "sk";
      break;
    case /^tr\b/.test(locale):
      locale = "tr";
      break;
    case /^uk\b/.test(locale):
      locale = "uk";
      break;
    case /^vi\b/.test(locale):
      locale = "vi";
      break;
    case /^sv-se\b/.test(locale):
    case /^sv\b/.test(locale):
      locale = "sv";
      break;
    case /^nl\b/.test(locale):
      locale = "nl";
      break;
    case /^nl-be\b/.test(locale):
      locale = "nl-be";
      break;
    case /^nb\b/.test(locale):
    case /^no\b/.test(locale):
      locale = "no";
      break;

    default:
      locale = "en";
  }

  return locale;
}

// TODO: was this really necessary?
// function removeEmpty(obj: Record<string, any>): void {
//   Object.keys(obj)
//     .filter((k) => obj[k] !== null && obj[k] !== undefined && obj[k] !== "") // Remove undef. and null and empty.string.
//     .reduce(
//       (newObj, k) =>
//         typeof obj[k] === "object"
//           ? Object.assign(newObj, { [k]: removeEmpty(obj[k]) }) // Recurse.
//           : Object.assign(newObj, { [k]: obj[k] }), // Copy value.
//       {}
//     );
// }

export const rtlLanguages = ["he", "ar"];

export const i18n = createI18n({
  locale: detectLocale(),
  fallbackLocale: "en",
  // Messages start empty and are filled on demand by loadLocaleMessages();
  // ensureInitialLocale() (called from main.ts) loads "en" + the active locale
  // before the app mounts.
  messages: {},
  // expose i18n.global for outside components
  legacy: true,
});

export const isRtl = (locale?: string) => {
  // see below
  // @ts-expect-error incorrect type when legacy
  return rtlLanguages.includes(locale || i18n.global.locale.value);
};

export async function setLocale(locale: string) {
  // Load the target locale's messages BEFORE switching, so the UI never flips
  // to raw keys mid-render. Callers may fire-and-forget; the active locale
  // simply changes once messages have arrived (a few ms for a local chunk).
  await loadLocaleMessages(locale);
  dayjs.locale(locale);
  // according to doc u only need .value if legacy: false but they lied
  // https://vue-i18n.intlify.dev/guide/essentials/scope.html#local-scope-1
  // @ts-expect-error incorrect type when legacy
  i18n.global.locale.value = locale;
}

export function setHtmlLocale(locale: string) {
  const html = document.documentElement;
  html.lang = locale;
  if (isRtl(locale)) html.dir = "rtl";
  else html.dir = "ltr";
}

export default i18n;
