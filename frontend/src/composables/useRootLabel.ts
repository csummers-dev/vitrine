/**
 * useRootLabel — the user's custom label for the files root ("My files").
 *
 * Stored in (cross-device) preferences under `nav.rootLabel`; blank means
 * "use the default label". Surfaced in the sidebar quick-link and the listing
 * header when at the storage root. The rename dialog (RootLabelDialog, mounted
 * once in App.vue) is opened from the sidebar's right-click menu — so the
 * open-state is a module-scoped singleton, same pattern as
 * useFavoriteTitleDialog.
 */
import { computed, ref, type Ref } from "vue";
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "nav.rootLabel";

/** Singleton open-state shared by the sidebar trigger and the one dialog. */
const dialogOpen: Ref<boolean> = ref(false);

export function useRootLabel() {
  const prefs = usePreferences();

  /** Custom root label, trimmed. "" when the user hasn't set one. */
  const rootLabel = computed<string>(() =>
    (prefs.get<string>(PREF_KEY, "") || "").trim()
  );

  /** Persist (or clear, when blank) the custom label. */
  const setRootLabel = (value: string) =>
    void prefs.set(PREF_KEY, value.trim());

  return {
    rootLabel,
    setRootLabel,
    dialogOpen,
    openDialog: () => {
      dialogOpen.value = true;
    },
    closeDialog: () => {
      dialogOpen.value = false;
    },
  };
}
