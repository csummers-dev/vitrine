import { computed, onMounted, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePreferences } from "@/composables/usePreferences";

/**
 * useProfileAvatar — the logged-in user's uploaded avatar image.
 *
 * The image is a small square (256², JPEG) cropped in the browser and stored
 * as a data-URI STRING in the per-user preferences bag — exactly the same
 * mechanism as the accent color and theme (see useAccentColor). No backend
 * changes: it rides the existing user PUT and survives a DB backup like every
 * other pref. Locked homelab-scale decision (few users): ~15–25KB per user in
 * the user record is fine, and it keeps the whole feature frontend-only.
 *
 * Empty string ⇒ no custom avatar ⇒ the four avatar spots fall back to the
 * accent initials circle they show today. Singleton module state so every
 * surface (sidebar, drawer, settings rail, the Profile editor) shares one
 * reactive source, mirroring useAccentColor's shape.
 */
const PREF_AVATAR = "profile.avatar";

// A data URI kept small on purpose; anything larger is almost certainly not
// one of our own 256² crops, so we ignore it rather than paint a huge blob.
const MAX_AVATAR_CHARS = 512 * 1024; // ~512KB of base64 (generous vs our ~20KB)

const isAvatar = (v: unknown): v is string =>
  typeof v === "string" &&
  v.startsWith("data:image/") &&
  v.length <= MAX_AVATAR_CHARS;

const avatar = ref<string>("");
let inited = false;

// Pinia-FREE read-only accessors. The four avatar render spots (sidebar,
// drawer, settings rail) only need to READ the current avatar — and the
// sidebar reads it at module-eval time, before Pinia is active. Touching
// usePreferences()/useAuthStore() there throws "no active Pinia". These read
// the module singleton directly, so they're safe anywhere. The full
// useProfileAvatar() (with the prefs-bound setter) is for setup contexts:
// the Profile editor and the App.vue bootstrap.
export const profileAvatarUrl = computed(() => avatar.value);
export const profileHasAvatar = computed(() => avatar.value !== "");

export function useProfileAvatar() {
  const prefs = usePreferences();
  const authStore = useAuthStore();

  const read = () => {
    const raw = prefs.get<string>(PREF_AVATAR, "");
    avatar.value = isAvatar(raw) ? raw : "";
  };

  /** Persist a new avatar (a `data:image/...;base64,...` URI) or clear it. */
  const setAvatar = (dataUri: string) => {
    const next = isAvatar(dataUri) ? dataUri : "";
    avatar.value = next;
    // Store "" (not delete) so the key stays present + explicit; the prefs
    // bag treats an empty string as "no avatar" via isAvatar on read.
    void prefs.set(PREF_AVATAR, next);
  };

  const clearAvatar = () => setAvatar("");

  const init = () => {
    if (inited) return;
    inited = true;
    read();
  };

  // Re-read when the account changes (login / user switch), like useAccentColor.
  watch(
    () => authStore.user?.username,
    () => {
      if (!inited) return;
      read();
    }
  );

  return {
    /** The data URI, or "" when the user has no custom avatar. */
    avatarUrl: computed(() => avatar.value),
    /** True when a custom avatar should render instead of initials. */
    hasAvatar: computed(() => avatar.value !== ""),
    setAvatar,
    clearAvatar,
    init,
  };
}

/** Mount-time bootstrap for App.vue (mirrors useAccentColorBootstrap). */
export function useProfileAvatarBootstrap() {
  const { init } = useProfileAvatar();
  onMounted(init);
}
