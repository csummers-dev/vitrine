import { onMounted, ref, watch, type Ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePreferences } from "@/composables/usePreferences";
import { deriveAccent, parseColor, toHex } from "@/utils/color";

/**
 * useAccentColor — the one highlight colour (active nav, primary actions,
 * focus, selection, progress).
 *
 * Which colour applies, in order:
 *   1. the preset the user picked in Profile (`accent.color` preference);
 *   2. the admin's branding colour (Settings → Global → Branding), if set;
 *   3. Green, the 4.0 default.
 *
 * Every shade is derived from the one base colour (utils/color deriveAccent),
 * so presets and any branding colour meet WCAG AA as text, on their tints
 * and under their on-accent label. Applied by writing SOURCE custom
 * properties on <html>; tokens.css derives every `--color-accent*` from them.
 * The CSS defaults are the Green preset, so first paint is right.
 */
export type AccentName =
  | "green"
  | "iris"
  | "indigo"
  | "violet"
  | "blue"
  | "cyan"
  | "emerald"
  | "amber";

export interface AccentPreset {
  name: AccentName;
  label: string;
  /** Swatch and solid fill (`--color-accent`). */
  value: string;
  /** Hover / pressed fill (`--color-accent-strong`). */
  strong: string;
  /** Accent as text on light surfaces. */
  inkLight: string;
  /** Accent as text on dark surfaces. */
  inkDark: string;
  /** Channels for `rgb(var(--accent-rgb) / a)` tints. */
  rgb: string;
  /** Label colour on the solid fill. */
  on: string;
}

const BASES: [AccentName, string, string][] = [
  ["green", "Green", "#12805c"],
  ["iris", "Iris", "#6e72d9"],
  ["indigo", "Indigo", "#6366f1"],
  ["violet", "Violet", "#8b5cf6"],
  ["blue", "Blue", "#2f6fd6"],
  ["cyan", "Cyan", "#22b8d4"],
  ["emerald", "Emerald", "#10b981"],
  ["amber", "Amber", "#f59e0b"],
];

export const ACCENT_PRESETS: AccentPreset[] = BASES.map(
  ([name, label, base]) => ({
    name,
    label,
    ...deriveAccent(base),
  })
);

export const DEFAULT_ACCENT: AccentName = "green";
const PREF_ACCENT = "accent.color";

const presetFor = (name: AccentName): AccentPreset =>
  ACCENT_PRESETS.find((p) => p.name === name) ?? ACCENT_PRESETS[0];

/** The admin branding colour as an accent, or null when unset or invalid. */
export function brandingAccent(
  raw: unknown = window.FileBrowser?.Color
): AccentPreset | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const c = parseColor(raw);
  if (!c) return null;
  return { name: "green", label: "Branding", ...deriveAccent(toHex(c)) };
}

/** The accent to apply for a stored preference (precedence above). */
export function resolveAccent(
  pref: unknown,
  branding: AccentPreset | null = brandingAccent()
): AccentPreset {
  if (isAccent(pref)) return presetFor(pref);
  return branding ?? presetFor(DEFAULT_ACCENT);
}

const apply = (p: AccentPreset, tag: string) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const s = root.style;
  s.setProperty("--accent", p.value);
  s.setProperty("--accent-grad", p.value);
  s.setProperty("--accent-strong", p.strong);
  s.setProperty("--accent-ink-light", p.inkLight);
  s.setProperty("--accent-ink-dark", p.inkDark);
  s.setProperty("--accent-rgb", p.rgb);
  s.setProperty("--color-on-accent", p.on);
  root.dataset.accent = tag;
};

const isAccent = (v: unknown): v is AccentName =>
  typeof v === "string" && ACCENT_PRESETS.some((p) => p.name === v);

// Singleton so the Profile picker and the bootstrap share one state.
// `accent` is the user's own pick, or null when they never picked one.
const accent: Ref<AccentName | null> = ref<AccentName | null>(null);
let inited = false;

export function useAccentColor() {
  const prefs = usePreferences();
  const authStore = useAuthStore();

  const read = () => {
    const raw = prefs.get<string | null>(PREF_ACCENT, null);
    accent.value = isAccent(raw) ? raw : null;
    const branding = brandingAccent();
    apply(
      resolveAccent(raw, branding),
      accent.value ?? (branding ? "branding" : DEFAULT_ACCENT)
    );
  };

  const setAccent = (next: AccentName) => {
    accent.value = next;
    apply(presetFor(next), next);
    void prefs.set(PREF_ACCENT, next);
  };

  const init = () => {
    if (inited) return;
    inited = true;
    read();
  };

  // Re-read when the user loads / switches accounts.
  watch(
    () => authStore.user?.username,
    () => {
      if (!inited) return;
      read();
    }
  );

  return { accent, presets: ACCENT_PRESETS, setAccent, init };
}

/** Mount-time bootstrap for App.vue. */
export function useAccentColorBootstrap() {
  const { init } = useAccentColor();
  onMounted(init);
}
