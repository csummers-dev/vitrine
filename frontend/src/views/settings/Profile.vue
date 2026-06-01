<template>
  <SettingsPage
    :title="t('settings.profileSettings')"
    description="Personal preferences for your account. Toggles save automatically; password requires confirmation."
  >
    <!-- ── Preferences (auto-save toggles) ───────────────────────────── -->
    <SettingsSection
      title="Preferences"
      description="How the file listing behaves for you."
    >
      <SettingsRow
        :label="t('settings.hideDotfiles')"
        description="Files and folders whose names start with a dot are hidden from the listing."
      >
        <Toggle v-model="hideDotfiles" @update:model-value="autoSave" />
      </SettingsRow>
      <SettingsRow
        :label="t('settings.singleClick')"
        description="Open files and folders with a single click instead of double-click."
      >
        <Toggle v-model="singleClick" @update:model-value="autoSave" />
      </SettingsRow>
      <SettingsRow
        :label="t('settings.redirectAfterCopyMove')"
        description="After moving or copying, navigate to the destination folder."
      >
        <Toggle
          v-model="redirectAfterCopyMove"
          @update:model-value="autoSave"
        />
      </SettingsRow>
      <SettingsRow
        :label="t('settings.setDateFormat')"
        description="Display dates in the long format set by your locale instead of relative time."
      >
        <Toggle v-model="dateFormat" @update:model-value="autoSave" />
      </SettingsRow>
      <!-- v1.3 S2-5: Inline tag visibility on file rows. Persisted via
           the usePreferences composable (S1-2), separately from the
           legacy user-fields path — no autoSave needed. -->
      <SettingsRow
        label="Show tags on file rows"
        description="When off, file tags only appear in the details sidebar — not inline on each row."
      >
        <Toggle
          v-model="showTagsOnRows"
          @update:model-value="onShowTagsChange"
        />
      </SettingsRow>
    </SettingsSection>

    <!-- ── Language ─────────────────────────────────────────────────── -->
    <SettingsSection
      :title="t('settings.language')"
      description="Interface language. Changes save automatically."
    >
      <SettingsRow stacked label="">
        <Languages
          class="settings-select"
          v-model:locale="locale"
          @update:locale="autoSave"
        />
      </SettingsRow>
    </SettingsSection>

    <!-- ── Appearance (Stage 11b) ───────────────────────────────────── -->
    <SettingsSection
      title="Appearance"
      description="Color scheme for the file browser. ‘System’ follows your OS setting."
    >
      <SettingsRow
        label="Theme"
        description="Saved to this browser per account."
      >
        <SegmentedControl
          v-model="themePref"
          :options="themeOptions"
          aria-label="Theme"
        />
      </SettingsRow>
      <!-- S8-4: accent color picker. Per-user (prefs bag, cross-device);
           overrides the --color-accent token + derivatives at runtime. -->
      <SettingsRow
        label="Accent color"
        description="Used across buttons, links, and highlights. Syncs to your account."
      >
        <div
          class="accent-swatches"
          role="radiogroup"
          aria-label="Accent color"
        >
          <button
            v-for="preset in accentPresets"
            :key="preset.key"
            type="button"
            class="accent-swatch"
            :class="{ 'accent-swatch--active': accentKey === preset.key }"
            :style="{ '--swatch': preset.base }"
            :title="preset.label"
            :aria-label="preset.label"
            role="radio"
            :aria-checked="accentKey === preset.key"
            @click="setAccent(preset.key)"
          >
            <Icon
              v-if="accentKey === preset.key"
              name="check"
              :size="13"
              :stroke-width="3"
            />
          </button>
        </div>
      </SettingsRow>

      <!-- Ambient accent-mesh background (mirrors the login screen). Per-user,
           syncs to the account; "Off" disables it entirely. -->
      <SettingsRow
        label="Background gradient"
        description="A soft wash of all six accent colors behind the app, like the login screen. Syncs to your account."
      >
        <SegmentedControl
          v-model="bgIntensity"
          :options="bgIntensityOptions"
          aria-label="Background gradient intensity"
        />
      </SettingsRow>
      <SettingsRow
        label="Translucent surfaces"
        description="Let the background gradient glow through panels, toolbars, and the sidebar."
      >
        <Toggle v-model="bgTranslucent" />
      </SettingsRow>
    </SettingsSection>

    <!-- ── Password (explicit save) ─────────────────────────────────── -->
    <form
      v-if="!noAuth && !authStore.user?.lockPassword"
      @submit.prevent="updatePassword"
    >
      <SettingsSection
        :title="t('settings.changePassword')"
        description="Use a strong password unique to this site. You'll be signed out of other sessions."
      >
        <SettingsRow stacked :label="t('settings.newPassword')">
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            class="settings-input"
            :class="passwordStateClass"
          />
        </SettingsRow>
        <SettingsRow stacked :label="t('settings.newPasswordConfirm')">
          <input
            v-model="passwordConf"
            type="password"
            autocomplete="new-password"
            class="settings-input"
            :class="passwordStateClass"
          />
          <p
            v-if="passwordMismatch"
            class="settings-helper settings-helper--error"
          >
            Passwords don't match.
          </p>
        </SettingsRow>
        <SettingsRow
          v-if="isCurrentPasswordRequired"
          stacked
          :label="t('settings.currentPassword')"
        >
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            class="settings-input"
          />
        </SettingsRow>

        <template #footer>
          <button
            type="submit"
            class="settings-btn settings-btn--primary"
            :disabled="!canSubmitPassword"
          >
            {{ t("buttons.update") }}
          </button>
        </template>
      </SettingsSection>
    </form>

    <!-- ── Save status indicator (auto-save toast-replacement) ───────── -->
    <Transition name="savestate">
      <div v-if="saveState !== 'idle'" class="save-state" :class="saveState">
        <Icon
          :name="
            saveState === 'saving'
              ? 'loader-circle'
              : saveState === 'saved'
                ? 'check'
                : 'triangle-alert'
          "
          :size="13"
          :class="{ 'save-state__spin': saveState === 'saving' }"
        />
        <span>{{ saveStateLabel }}</span>
      </div>
    </Transition>
  </SettingsPage>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { users as api } from "@/api";
import { authMethod, noAuth } from "@/utils/constants";

import SettingsPage from "@/components/settings/SettingsPage.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import Toggle from "@/components/settings/Toggle.vue";
import Languages from "@/components/settings/Languages.vue";
import SegmentedControl from "@/components/SegmentedControl.vue";
import Icon from "@/components/Icon.vue";
import {
  useThemePreference,
  type ThemePreference,
} from "@/composables/useThemePreference";
import { usePreferences } from "@/composables/usePreferences";
import { useAccentColor } from "@/composables/useAccentColor";
import {
  useBackgroundGradient,
  type BgIntensity,
} from "@/composables/useBackgroundGradient";

const { t } = useI18n();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();

const $showSuccess = inject<IToastSuccess>("$showSuccess")!;
const $showError = inject<IToastError>("$showError")!;

// ── Preferences (auto-saved) ─────────────────────────────────────────
const hideDotfiles = ref(false);
const singleClick = ref(false);
const redirectAfterCopyMove = ref(false);
const dateFormat = ref(false);
const locale = ref<string>("");

// v1.3 S2-5: inline tag visibility on file rows. Persists via the
// usePreferences composable rather than the legacy users.update path
// — keeps the surface-area split clean (server-validated fields vs.
// opaque UI prefs bag).
const prefs = usePreferences();
const showTagsOnRows = ref<boolean>(
  prefs.get<boolean>("tags.showOnRows", true)
);

// S8-4: accent color picker. Singleton composable shared with the
// app-wide bootstrap; `set` persists to the prefs bag + applies live.
const accentColor = useAccentColor();
const accentPresets = accentColor.presets;
const accentKey = accentColor.accent;
const setAccent = (key: string) => accentColor.set(key);
const onShowTagsChange = (val: boolean) => {
  void prefs.set("tags.showOnRows", val);
};

// ── Appearance (theme preference) ────────────────────────────────────
const themePrefStore = useThemePreference();
const themePref = computed<ThemePreference>({
  get: () => themePrefStore.preference.value,
  set: (v) => themePrefStore.set(v),
});
const themeOptions: { value: ThemePreference; label: string; icon: string }[] =
  [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "monitor" },
  ];

// Ambient accent-mesh app background (per-user; same gradient as the login
// screen). Singleton composable shared with the app-wide bootstrap; the
// computed setters persist to the prefs bag + apply live.
const bg = useBackgroundGradient();
const bgIntensityOptions = bg.intensities;
const bgIntensity = computed<BgIntensity>({
  get: () => bg.intensity.value,
  set: (v) => bg.setIntensity(v),
});
const bgTranslucent = computed<boolean>({
  get: () => bg.translucent.value,
  set: (v) => bg.setTranslucent(v),
});

// ── Password (explicit save) ─────────────────────────────────────────
const password = ref<string>("");
const passwordConf = ref<string>("");
const currentPassword = ref<string>("");
const isCurrentPasswordRequired = ref<boolean>(false);

// ── Save state pill ──────────────────────────────────────────────────
type SaveState = "idle" | "saving" | "saved" | "error";
const saveState = ref<SaveState>("idle");
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let savedHideTimer: ReturnType<typeof setTimeout> | null = null;

const saveStateLabel = computed(() => {
  switch (saveState.value) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Couldn't save";
    default:
      return "";
  }
});

const passwordMismatch = computed(
  () =>
    password.value !== "" &&
    passwordConf.value !== "" &&
    password.value !== passwordConf.value
);

const passwordStateClass = computed(() => {
  if (password.value === "" && passwordConf.value === "") return "";
  return passwordMismatch.value
    ? "is-error"
    : password.value === passwordConf.value
      ? "is-ok"
      : "";
});

const canSubmitPassword = computed(() => {
  if (password.value === "" || passwordConf.value === "") return false;
  if (passwordMismatch.value) return false;
  if (isCurrentPasswordRequired.value && currentPassword.value === "")
    return false;
  return true;
});

// ── Lifecycle ────────────────────────────────────────────────────────
onMounted(() => {
  layoutStore.loading = true;
  if (authStore.user) {
    locale.value = authStore.user.locale;
    hideDotfiles.value = authStore.user.hideDotfiles;
    singleClick.value = authStore.user.singleClick;
    redirectAfterCopyMove.value = authStore.user.redirectAfterCopyMove;
    dateFormat.value = authStore.user.dateFormat;
  }
  isCurrentPasswordRequired.value = authMethod === "json";
  layoutStore.loading = false;
});

// ── Auto-save (debounced) ────────────────────────────────────────────
const PREF_KEYS = [
  "locale",
  "hideDotfiles",
  "singleClick",
  "redirectAfterCopyMove",
  "dateFormat",
];

const autoSave = () => {
  if (!authStore.user) return;
  saveState.value = "saving";
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  if (savedHideTimer) clearTimeout(savedHideTimer);

  saveDebounceTimer = setTimeout(async () => {
    saveDebounceTimer = null;
    try {
      const data = {
        ...authStore.user!,
        id: authStore.user!.id,
        locale: locale.value,
        hideDotfiles: hideDotfiles.value,
        singleClick: singleClick.value,
        redirectAfterCopyMove: redirectAfterCopyMove.value,
        dateFormat: dateFormat.value,
      };
      await api.update(data, PREF_KEYS);
      authStore.updateUser(data);
      saveState.value = "saved";
      savedHideTimer = setTimeout(() => {
        if (saveState.value === "saved") saveState.value = "idle";
      }, 1800);
    } catch (e) {
      saveState.value = "error";
      if (e instanceof Error) $showError(e);
    }
  }, 350);
};

// ── Password update (explicit) ───────────────────────────────────────
const updatePassword = async () => {
  if (!canSubmitPassword.value || !authStore.user) return;
  try {
    const data = {
      ...authStore.user,
      id: authStore.user.id,
      password: password.value,
    };
    await api.update(data, ["password"], currentPassword.value);
    authStore.updateUser(data);
    $showSuccess(t("settings.passwordUpdated"));
    password.value = "";
    passwordConf.value = "";
    currentPassword.value = "";
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
};
</script>

<style scoped>
/* No-op layout helper for the Languages select. The chrome (height,
   padding, border, chevron, appearance:none) lives in global
   `.fb-select` (frontend/src/css/styles.css) which the select
   already applies via class="fb-select".
   Previously this rule re-declared a `background: var(...)` shorthand
   that *erased* `.fb-select`'s background-image (the chevron) and
   reduced the right padding, causing the native select to render
   without its open-on-click chrome on some browsers and stacking
   option text over the visible value. Now we just guarantee full
   width and let the global treatment win. */
.settings-select {
  width: 100%;
}

.settings-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.settings-input:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}

.settings-input.is-ok {
  border-color: #10b981;
}

.settings-input.is-error {
  border-color: #dc2626;
}

.settings-helper {
  margin: 4px 0 0;
  font-size: 11.5px;
}

.settings-helper--error {
  color: #dc2626;
}

.settings-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.settings-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.settings-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.settings-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.settings-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Save-state pill (fixed bottom-right) ───────────────────────────── */
.save-state {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  /* Saving state uses the app accent (lilac). Saved keeps the calm
     green; error keeps red — both still readable on the same chrome. */
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 8px 24px -8px rgba(94, 106, 210, 0.45);
}

.save-state.saved {
  background: #047857;
  box-shadow: 0 8px 24px -8px rgba(4, 120, 87, 0.45);
}

.save-state.error {
  background: #b91c1c;
  box-shadow: 0 8px 24px -8px rgba(185, 28, 28, 0.45);
}

.save-state__spin {
  animation: save-state-spin 0.9s linear infinite;
}

@keyframes save-state-spin {
  to {
    transform: rotate(360deg);
  }
}

.savestate-enter-active,
.savestate-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.savestate-enter-from,
.savestate-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ── S8-4: accent swatch picker ─────────────────────────────────────── */
.accent-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.accent-swatch {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full, 9999px);
  background: var(--swatch);
  border: 0;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.accent-swatch:hover {
  transform: scale(1.08);
}

.accent-swatch:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--color-surface, #fff),
    0 0 0 4px var(--swatch);
}

/* Selected: a ringed halo using the swatch's own color. */
.accent-swatch--active {
  box-shadow:
    0 0 0 2px var(--color-surface, #fff),
    0 0 0 4px var(--swatch);
}

@media (prefers-reduced-motion: reduce) {
  .accent-swatch {
    transition: none;
  }
  .accent-swatch:hover {
    transform: none;
  }
}
</style>
