<template>
  <SettingsPage
    :title="t('settings.profileSettings')"
    icon="user"
    accent="var(--color-accent)"
    description="Personal preferences for your account. Toggles save automatically; password requires confirmation."
  >
    <!-- ── Avatar ─────────────────────────────────────────────────────── -->
    <SettingsSection
      title="Photo"
      description="Your avatar in the sidebar and menus. Stored on your account."
    >
      <div class="avatar-row">
        <div class="avatar-preview">
          <img
            v-if="hasAvatar"
            :src="avatarUrl"
            class="avatar-preview__img"
            alt="Your avatar"
          />
          <span v-else class="avatar-preview__initials avatar-accent">{{
            userInitials
          }}</span>
        </div>
        <div class="avatar-actions">
          <button
            type="button"
            class="avatar-btn avatar-btn--primary"
            @click="pickAvatar"
          >
            <Icon name="upload" :size="14" />
            <span>{{ hasAvatar ? "Change photo" : "Upload photo" }}</span>
          </button>
          <button
            v-if="hasAvatar"
            type="button"
            class="avatar-btn avatar-btn--ghost"
            @click="removeAvatar"
          >
            Remove
          </button>
          <p class="avatar-hint">JPG, PNG, GIF, or WebP.</p>
        </div>
      </div>
      <input
        ref="avatarInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onAvatarPicked"
      />
    </SettingsSection>

    <AvatarCropper
      :open="cropperOpen"
      :src="cropSrc"
      @cancel="closeCropper"
      @save="onCropSaved"
    />

    <ConfirmDialog
      :open="removeConfirmOpen"
      title="Remove your photo?"
      message="Your avatar goes back to your initials. You can upload a new one any time."
      confirm-label="Remove"
      cancel-label="Cancel"
      destructive
      @confirm="onRemoveConfirmed"
      @cancel="removeConfirmOpen = false"
    />

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
      <SettingsRow
        label="Remember position when navigating back"
        description="Returning to a folder you were recently in — even across directories — restores your scroll position, and in-place refreshes (like a finished upload) keep your place instead of jumping to the top."
      >
        <Toggle
          v-model="rememberParentScroll"
          @update:model-value="onRememberParentScrollChange"
        />
      </SettingsRow>
      <!-- WS8: show/hide file extensions in the listing. When off, rows show
           the base name and renaming edits the base + re-appends the original
           extension. Folders + dotfiles are unaffected. -->
      <SettingsRow
        label="Show file extensions"
        description="When off, file rows show the name without its extension. Renaming edits the base name and keeps the original extension."
      >
        <Toggle
          v-model="showExtensions"
          @update:model-value="onShowExtensionsChange"
        />
      </SettingsRow>
      <!-- 4.0 5.4: upload concurrency. -->
      <SettingsRow
        label="Files uploaded at once"
        description="More is faster on a fast connection; fewer is gentler on a small NAS or a slow link."
      >
        <select
          v-model.number="uploadLimit"
          class="settings-input settings-input--compact"
          aria-label="Files uploaded at once"
          @change="onUploadLimitChange"
        >
          <option v-for="n in uploadLimitChoices" :key="n" :value="n">
            {{ n }}
          </option>
        </select>
      </SettingsRow>
      <!-- 4.0 3.2: folder tiles show poster/folder/cover art. -->
      <SettingsRow
        label="Folder cover art"
        description="In grid and gallery views, folders show a poster.jpg, folder.jpg, cover.jpg or fanart.jpg inside them, or a music folder's album art."
      >
        <Toggle
          v-model="folderCovers"
          @update:model-value="onFolderCoversChange"
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

      <!-- Accent color (Calm Minimal): the single highlight hue, applied live
           across the app. Green is the default; the admin's branding colour
           applies when the user hasn't picked one. -->
      <SettingsRow
        label="Accent color"
        description="The single highlight color used across the app — navigation, buttons, focus and selection."
      >
        <div
          class="accent-swatches"
          role="radiogroup"
          aria-label="Accent color"
          style="display: flex; gap: 10px; align-items: center"
        >
          <button
            v-for="p in accentPresets"
            :key="p.name"
            type="button"
            role="radio"
            :aria-checked="accent === p.name"
            :aria-label="p.label"
            :title="p.label"
            style="
              width: 24px;
              height: 24px;
              border-radius: 50%;
              border: none;
              padding: 0;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition:
                box-shadow var(--dur-base) ease,
                transform var(--dur-base) ease;
            "
            :style="{
              background: p.value,
              color: p.on,
              boxShadow:
                accent === p.name
                  ? '0 0 0 2px var(--color-surface), 0 0 0 4px ' + p.value
                  : '0 0 0 1px var(--color-line-strong)',
            }"
            @click="setAccent(p.name)"
          >
            <Icon
              v-if="accent === p.name"
              name="check"
              :size="13"
              :stroke-width="3"
            />
          </button>
        </div>
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

    <!-- ── Two-factor sign-in (4.0 4.4) ─────────────────────────────── -->
    <TwoFactorSettings v-if="!noAuth" />

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
import SegmentedControl from "@/components/SegmentedControl.vue";
import Icon from "@/components/Icon.vue";
import {
  useThemePreference,
  type ThemePreference,
} from "@/composables/useThemePreference";
import { usePreferences } from "@/composables/usePreferences";
import {
  useAccentColor,
  brandingAccent,
  DEFAULT_ACCENT,
} from "@/composables/useAccentColor";
import { useProfileAvatar } from "@/composables/useProfileAvatar";
import AvatarCropper from "@/components/settings/AvatarCropper.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import TwoFactorSettings from "@/components/settings/TwoFactorSettings.vue";
import { uploadConcurrencyMax } from "@/utils/constants";
import {
  effectiveUploadLimit,
  UPLOAD_LIMIT_DEFAULT,
  UPLOAD_LIMIT_MAX,
  UPLOAD_LIMIT_PREF,
} from "@/utils/uploadLimit";

const { t } = useI18n();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();

// ── Profile avatar (upload → crop → prefs bag) ──────────────────────
// ($showError / $showSuccess are injected just below, next to the password
//  form that already used them.)
const { avatarUrl, hasAvatar, setAvatar, clearAvatar } = useProfileAvatar();

const userInitials = computed(() => {
  const name = authStore.user?.username ?? "";
  const parts = name.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
});

const avatarInput = ref<HTMLInputElement | null>(null);
const cropperOpen = ref(false);
const cropSrc = ref("");

const pickAvatar = () => avatarInput.value?.click();

const onAvatarPicked = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // reset so re-picking the same file fires change again
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    $showError(new Error("That file isn't an image."));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    cropSrc.value = String(reader.result ?? "");
    cropperOpen.value = true;
  };
  reader.onerror = () => $showError(new Error("Couldn't read that image."));
  reader.readAsDataURL(file);
};

const closeCropper = () => {
  cropperOpen.value = false;
  cropSrc.value = "";
};
const onCropSaved = (dataUri: string) => {
  setAvatar(dataUri);
  closeCropper();
};

const removeConfirmOpen = ref(false);
const removeAvatar = () => {
  removeConfirmOpen.value = true;
};
const onRemoveConfirmed = () => {
  clearAvatar();
  removeConfirmOpen.value = false;
};

const $showSuccess = inject<IToastSuccess>("$showSuccess")!;
const $showError = inject<IToastError>("$showError")!;

// ── Preferences (auto-saved) ─────────────────────────────────────────
const hideDotfiles = ref(false);
const singleClick = ref(false);
const redirectAfterCopyMove = ref(false);
const dateFormat = ref(false);

// v1.3 S2-5: inline tag visibility on file rows. Persists via the
// usePreferences composable rather than the legacy users.update path
// — keeps the surface-area split clean (server-validated fields vs.
// opaque UI prefs bag).
const prefs = usePreferences();
const showTagsOnRows = ref<boolean>(
  prefs.get<boolean>("tags.showOnRows", true)
);

const onShowTagsChange = (val: boolean) => {
  void prefs.set("tags.showOnRows", val);
};

// Remember-scroll-position-on-back preference (default on). Persisted in the
// prefs bag; consumed by FileListing's useFolderScrollMemory.
const rememberParentScroll = ref<boolean>(
  prefs.get<boolean>("nav.rememberParentScroll", true)
);
const onRememberParentScrollChange = (val: boolean) => {
  void prefs.set("nav.rememberParentScroll", val);
};

// WS8: show/hide file extensions in the listing (default on).
const showExtensions = ref<boolean>(
  prefs.get<boolean>("nav.showExtensions", true)
);
const onShowExtensionsChange = (val: boolean) => {
  void prefs.set("nav.showExtensions", val);
};

// 4.0 5.4: simultaneous uploads, capped by the admin.
const uploadLimitChoices = Array.from(
  { length: effectiveUploadLimit(UPLOAD_LIMIT_MAX, uploadConcurrencyMax) },
  (_, i) => i + 1
);
const uploadLimit = ref<number>(
  effectiveUploadLimit(
    prefs.get<number>(UPLOAD_LIMIT_PREF, UPLOAD_LIMIT_DEFAULT),
    uploadConcurrencyMax
  )
);
const onUploadLimitChange = () => {
  void prefs.set(UPLOAD_LIMIT_PREF, uploadLimit.value);
};

// 4.0 3.2: cover art on folder tiles (default on).
const folderCovers = ref<boolean>(
  prefs.get<boolean>("view.folderCovers", true)
);
const onFolderCoversChange = (val: boolean) => {
  void prefs.set("view.folderCovers", val);
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

// Accent color (Calm Minimal). Singleton composable shared with the app-wide
// bootstrap; setAccent persists to the prefs bag + recolors the UI live.
const accentColor = useAccentColor();
const accentPresets = accentColor.presets;
// The swatch shown as chosen: the user's pick, else Green unless the
// admin's branding colour is in effect (then none is ticked).
const accent = computed(
  () => accentColor.accent.value ?? (brandingAccent() ? null : DEFAULT_ACCENT)
);
const setAccent = accentColor.setAccent;

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
/* ── Avatar section ──────────────────────────────────────────────── */
.avatar-row {
  display: flex;
  align-items: center;
  gap: 18px;
  /* The avatar block isn't a .settings-row, so it gets no padding from the
     section — give it its own so it isn't jammed against the card edges
     (matches the row rhythm: 16px 18px). */
  padding: 16px 18px;
}
.avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: var(--shadow-1);
}
.avatar-preview__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.avatar-preview__initials {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-accent);
  font-size: 22px;
  font-weight: 600;
}
.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.avatar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.avatar-btn--primary {
  background: var(--accent-gradient);
  border: 1px solid var(--color-accent);
  color: var(--color-on-accent);
}
.avatar-btn--primary:hover {
  background: var(--accent-gradient-strong);
}
.avatar-btn--ghost {
  background: transparent;
  border: 1px solid var(--color-line-strong);
  color: var(--color-ink-2);
}
.avatar-btn--ghost:hover {
  background: var(--color-hover);
  color: var(--color-ink-1);
}
.avatar-hint {
  width: 100%;
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-ink-3);
}
.hidden {
  display: none;
}

.settings-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-surface);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.settings-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-ring);
}

.settings-input.is-ok {
  border-color: var(--status-success);
}

.settings-input.is-error {
  border-color: var(--status-danger-fill);
}

.settings-helper {
  margin: 4px 0 0;
  font-size: 11.5px;
}

.settings-helper--error {
  color: var(--status-danger);
}

.settings-input--compact {
  width: auto;
  min-width: 72px;
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
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 1px;
}

.settings-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
}

.settings-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong);
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
  color: var(--color-on-accent);
  box-shadow: 0 8px 24px -8px var(--color-accent-ring);
}

.save-state.saved {
  background: var(--status-success-fill);
  box-shadow: 0 8px 24px -8px var(--status-success-soft);
}

.save-state.error {
  background: var(--status-danger-fill-strong);
  box-shadow: 0 8px 24px -8px var(--status-danger-ring);
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
</style>
