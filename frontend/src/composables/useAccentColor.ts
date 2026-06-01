import { onMounted, ref, watch, type Ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePreferences } from "@/composables/usePreferences";

/**
 * useAccentColor — per-user theme accent picker (v1.3 S8-4).
 *
 * Six presets. The chosen one is persisted to `user.Preferences.accentColor`
 * (the S1-1 prefs bag, so it's cross-device + optimistic) and applied at
 * runtime by overriding the accent design tokens as inline custom
 * properties on <html> (inline beats the `:root` rule from tokens.css).
 *
 * The "lilac" preset IS the brand default, so selecting it just clears the
 * override — falling back to tokens.css, which keeps its per-theme
 * soft/ring alpha tuning. Non-default presets derive `-soft` / `-ring`
 * from the base color at a single sensible alpha that reads well in both
 * light and dark.
 */
export interface AccentPreset {
  key: string;
  label: string;
  /** --color-accent */
  base: string;
  /** --color-accent-strong (hover/active) */
  strong: string;
}

const DEFAULT_KEY = "lilac";

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: "lilac", label: "Lilac", base: "#5e6ad2", strong: "#4f5ac4" },
  { key: "blue", label: "Blue", base: "#3b82f6", strong: "#2563eb" },
  { key: "teal", label: "Teal", base: "#0d9488", strong: "#0f766e" },
  { key: "green", label: "Green", base: "#16a34a", strong: "#15803d" },
  { key: "amber", label: "Amber", base: "#d97706", strong: "#b45309" },
  { key: "rose", label: "Rose", base: "#e11d48", strong: "#be123c" },
];

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const ACCENT_VARS = [
  "--color-accent",
  "--color-accent-strong",
  "--color-accent-soft",
  "--color-accent-ring",
] as const;

const applyAccent = (key: string) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = ACCENT_PRESETS.find((p) => p.key === key);

  // Default (or unknown) → drop the overrides and let tokens.css win.
  if (!preset || preset.key === DEFAULT_KEY) {
    for (const v of ACCENT_VARS) root.style.removeProperty(v);
    return;
  }

  root.style.setProperty("--color-accent", preset.base);
  root.style.setProperty("--color-accent-strong", preset.strong);
  const rgb = hexToRgb(preset.base);
  if (rgb) {
    const { r, g, b } = rgb;
    root.style.setProperty(
      "--color-accent-soft",
      `rgba(${r}, ${g}, ${b}, 0.12)`
    );
    root.style.setProperty(
      "--color-accent-ring",
      `rgba(${r}, ${g}, ${b}, 0.4)`
    );
  }
};

// Singleton so the Profile picker + the bootstrap share one source of
// truth without a Pinia store (mirrors useThemePreference).
const accent: Ref<string> = ref<string>(DEFAULT_KEY);
let inited = false;

export function useAccentColor() {
  const prefs = usePreferences();
  const authStore = useAuthStore();

  /** Persist + apply a preset. */
  const set = (key: string) => {
    accent.value = key;
    applyAccent(key);
    void prefs.set("accentColor", key);
  };

  /** First-run: read the stored preset + apply it. */
  const init = () => {
    if (inited) return;
    inited = true;
    accent.value = prefs.get<string>("accentColor", DEFAULT_KEY);
    applyAccent(accent.value);
  };

  // Re-read when the user loads / switches accounts.
  watch(
    () => authStore.user?.username,
    () => {
      if (!inited) return;
      accent.value = prefs.get<string>("accentColor", DEFAULT_KEY);
      applyAccent(accent.value);
    }
  );

  return { accent, presets: ACCENT_PRESETS, set, init };
}

/** Mount-time bootstrap for App.vue (mirrors useThemeBootstrap). */
export function useAccentBootstrap() {
  const { init } = useAccentColor();
  onMounted(init);
}
