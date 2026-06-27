import { onMounted, ref, watch, type Ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePreferences } from "@/composables/usePreferences";

/**
 * useAccentColor — per-user accent hue (Calm Minimal redesign, Stage 0).
 *
 * The accent is the ONE color the UI leans on (active nav, primary actions,
 * focus, selection, progress, the ambient wash). Six presets; the choice is
 * persisted to the prefs bag (cross-device + optimistic) exactly like
 * useBackgroundGradient / useThemePreference.
 *
 * Applied at runtime by writing five SOURCE custom properties on <html>
 * (`--accent`, `--accent-grad`, `--accent-strong`, `--accent-ink-dark`,
 * `--accent-rgb`) plus `--color-on-accent`; tokens.css DERIVES every
 * `--color-accent*` (and the theme-dependent tints) from those, so a single
 * picker recolors the whole app. The CSS defaults (= Violet) match
 * DEFAULT_ACCENT, so the common case paints correctly before init() runs.
 */
export type AccentName =
  | "indigo"
  | "violet"
  | "blue"
  | "cyan"
  | "emerald"
  | "amber";

export interface AccentPreset {
  name: AccentName;
  label: string;
  /** Swatch + primary (`--color-accent`). */
  value: string;
  /** Lighter gradient end-stop (storage bar, accent-filled sheen). */
  grad: string;
  /** Deeper hover / border (`--color-accent-strong`). */
  strong: string;
  /** Light tint used as accent-colored TEXT on the dark canvas. */
  inkDark: string;
  /** Space-separated RGB channel for `rgb(var(--accent-rgb) / a)` tints. */
  rgb: string;
  /** Foreground on a SOLID accent fill — white for dark hues, near-black for
   *  the light ones (cyan/amber) so on-accent text stays AA-legible. */
  on: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "indigo", label: "Indigo", value: "#6366f1", grad: "#818cf8", strong: "#4f46e5", inkDark: "#c7ccfb", rgb: "99 102 241", on: "#ffffff" }, // prettier-ignore
  { name: "violet", label: "Violet", value: "#8b5cf6", grad: "#a78bfa", strong: "#7c3aed", inkDark: "#d6c8fb", rgb: "139 92 246", on: "#ffffff" }, // prettier-ignore
  { name: "blue", label: "Blue", value: "#3b82f6", grad: "#60a5fa", strong: "#2563eb", inkDark: "#bfdbfe", rgb: "59 130 246", on: "#ffffff" }, // prettier-ignore
  { name: "cyan", label: "Cyan", value: "#22b8d4", grad: "#4dd2e8", strong: "#0e7e98", inkDark: "#a8e7f4", rgb: "34 184 212", on: "#06323b" }, // prettier-ignore
  { name: "emerald", label: "Emerald", value: "#10b981", grad: "#34d399", strong: "#0a9468", inkDark: "#a3ead0", rgb: "16 185 129", on: "#ffffff" }, // prettier-ignore
  { name: "amber", label: "Amber", value: "#f59e0b", grad: "#fbbf24", strong: "#d97706", inkDark: "#f3cf92", rgb: "245 158 11", on: "#3d2a04" }, // prettier-ignore
];

/** Calm Minimal default. Matches the CSS source-var defaults in tokens.css. */
const DEFAULT_ACCENT: AccentName = "violet";
const PREF_ACCENT = "accent.color";

const presetFor = (name: AccentName): AccentPreset =>
  ACCENT_PRESETS.find((p) => p.name === name) ?? ACCENT_PRESETS[1];

const apply = (name: AccentName) => {
  if (typeof document === "undefined") return;
  const p = presetFor(name);
  const s = document.documentElement.style;
  s.setProperty("--accent", p.value);
  s.setProperty("--accent-grad", p.grad);
  s.setProperty("--accent-strong", p.strong);
  s.setProperty("--accent-ink-dark", p.inkDark);
  s.setProperty("--accent-rgb", p.rgb);
  s.setProperty("--color-on-accent", p.on);
  document.documentElement.dataset.accent = name;
};

const isAccent = (v: unknown): v is AccentName =>
  typeof v === "string" && ACCENT_PRESETS.some((p) => p.name === v);

// Singleton so the Profile picker + the bootstrap share one source of truth
// without a Pinia store (mirrors useBackgroundGradient / useThemePreference).
const accent: Ref<AccentName> = ref<AccentName>(DEFAULT_ACCENT);
let inited = false;

export function useAccentColor() {
  const prefs = usePreferences();
  const authStore = useAuthStore();

  /** Read pref → state → DOM. */
  const read = () => {
    const raw = prefs.get<string>(PREF_ACCENT, DEFAULT_ACCENT);
    accent.value = isAccent(raw) ? raw : DEFAULT_ACCENT;
    apply(accent.value);
  };

  const setAccent = (next: AccentName) => {
    accent.value = next;
    apply(next);
    void prefs.set(PREF_ACCENT, next);
  };

  /** First-run: read the stored pref + apply it. */
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

/** Mount-time bootstrap for App.vue (mirrors useBackgroundGradientBootstrap). */
export function useAccentColorBootstrap() {
  const { init } = useAccentColor();
  onMounted(init);
}
