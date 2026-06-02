import { onMounted, ref, watch, type Ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePreferences } from "@/composables/usePreferences";

/**
 * useBackgroundGradient — per-user ambient accent-mesh app background.
 *
 * The same six-color radial gradient as the login screen (one soft blob per
 * accent preset), applied subtly behind the app shell. Two independent knobs,
 * both persisted to the prefs bag (cross-device + optimistic) like the accent
 * color picker:
 *
 *   - intensity: how strongly the mesh reads. "off" hides it entirely.
 *   - translucent: whether the app's chrome surfaces (sidebar, toolbars,
 *     details/settings/slide-over panels, grid tiles, preview shell, …) go
 *     glassy so the mesh bleeds through them too (vs. opaque surfaces with the
 *     mesh only in the content area / behind the transparent list rows).
 *
 * Applied at runtime by setting data-attributes on <html>; styles.css keys the
 * `.app-mesh` layer opacity + the surface translucency off those attributes
 * (`data-bg-intensity`, `data-bg-surfaces`). Defaults — subtle + translucent —
 * are also the CSS defaults, so the common case renders correctly even before
 * this composable's init() runs (no flash for users on the default).
 */
export type BgIntensity = "off" | "whisper" | "subtle" | "bold";

/** Options for the Profile SegmentedControl (and the canonical value list). */
export const BG_INTENSITIES: { value: BgIntensity; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "whisper", label: "Whisper" },
  { value: "subtle", label: "Subtle" },
  { value: "bold", label: "Bold" },
];

const DEFAULT_INTENSITY: BgIntensity = "subtle";
const DEFAULT_TRANSLUCENT = true;

const PREF_INTENSITY = "bg.intensity";
const PREF_TRANSLUCENT = "bg.translucentSurfaces";

const isIntensity = (v: unknown): v is BgIntensity =>
  v === "off" || v === "whisper" || v === "subtle" || v === "bold";

const apply = (intensity: BgIntensity, translucent: boolean) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.bgIntensity = intensity;
  root.dataset.bgSurfaces = translucent ? "translucent" : "solid";
};

// Singletons so the Profile controls + the bootstrap share one source of
// truth without a Pinia store (mirrors useThemePreference).
const intensity: Ref<BgIntensity> = ref<BgIntensity>(DEFAULT_INTENSITY);
const translucent: Ref<boolean> = ref<boolean>(DEFAULT_TRANSLUCENT);
let inited = false;

export function useBackgroundGradient() {
  const prefs = usePreferences();
  const authStore = useAuthStore();

  /** Read both prefs → state → DOM. */
  const read = () => {
    const raw = prefs.get<string>(PREF_INTENSITY, DEFAULT_INTENSITY);
    intensity.value = isIntensity(raw) ? raw : DEFAULT_INTENSITY;
    translucent.value = prefs.get<boolean>(
      PREF_TRANSLUCENT,
      DEFAULT_TRANSLUCENT
    );
    apply(intensity.value, translucent.value);
  };

  const setIntensity = (next: BgIntensity) => {
    intensity.value = next;
    apply(intensity.value, translucent.value);
    void prefs.set(PREF_INTENSITY, next);
  };

  const setTranslucent = (next: boolean) => {
    translucent.value = next;
    apply(intensity.value, translucent.value);
    void prefs.set(PREF_TRANSLUCENT, next);
  };

  /** First-run: read the stored prefs + apply them. */
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

  return {
    intensity,
    translucent,
    intensities: BG_INTENSITIES,
    setIntensity,
    setTranslucent,
    init,
  };
}

/** Mount-time bootstrap for App.vue (mirrors useThemeBootstrap). */
export function useBackgroundGradientBootstrap() {
  const { init } = useBackgroundGradient();
  onMounted(init);
}
