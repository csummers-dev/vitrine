// Shared setup for tests that exercise prefs-backed composables (useFavorites,
// useRecents, useCommandMRU, …). NOT a test file — the leading underscore keeps
// it out of vitest's `*.test.ts` glob. Mock "@/api/users" in the test itself so
// the debounced server save is a no-op.
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { __resetPreferencesForTests } from "@/composables/usePreferences";

/** A complete logged-in IUser for prefs-backed composable tests. */
export function baseUser(): IUser {
  return {
    id: 7,
    username: "u",
    password: "",
    scope: "",
    locale: "en",
    perm: {
      admin: false,
      copy: true,
      create: true,
      delete: true,
      download: true,
      execute: true,
      modify: true,
      move: true,
      rename: true,
      share: true,
      shell: false,
      upload: true,
    },
    commands: [],
    rules: [],
    lockPassword: false,
    hideDotfiles: false,
    singleClick: false,
    redirectAfterCopyMove: false,
    dateFormat: false,
    viewMode: "list",
    preferences: {},
  };
}

/** Fresh Pinia + a logged-in user + a cleared prefs cache. Call in beforeEach. */
export function resetPrefsHarness(): void {
  setActivePinia(createPinia());
  useAuthStore().setUser(baseUser());
  __resetPreferencesForTests();
}
