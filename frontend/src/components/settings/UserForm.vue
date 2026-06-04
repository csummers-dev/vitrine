<template>
  <div class="user-form">
    <!-- ── Account ─────────────────────────────────────────────────── -->
    <SettingsSection
      v-if="!isDefault"
      title="Account"
      description="Login credentials and home directory."
    >
      <SettingsRow stacked :label="t('settings.username')">
        <input
          id="username"
          v-model="user.username"
          type="text"
          autocomplete="username"
          class="settings-input"
        />
      </SettingsRow>
      <SettingsRow stacked :label="t('settings.password')">
        <input
          id="password"
          v-model="user.password"
          type="password"
          autocomplete="new-password"
          :placeholder="passwordPlaceholder"
          class="settings-input"
          :class="{ 'is-error': passwordTooShort }"
        />
        <p
          v-if="passwordTooShort"
          class="settings-helper settings-helper--error"
        >
          Password must be at least {{ minimumPasswordLength }}
          {{ minimumPasswordLength === 1 ? "character" : "characters" }}.
        </p>
      </SettingsRow>
      <SettingsRow
        v-if="user.perm"
        :label="t('settings.lockPassword')"
        description="The user cannot change their own password."
      >
        <Toggle
          :modelValue="!!user.lockPassword"
          :disabled="user.perm.admin"
          @update:modelValue="(v) => (user.lockPassword = v)"
        />
      </SettingsRow>
    </SettingsSection>

    <!-- ── Scope ───────────────────────────────────────────────────── -->
    <SettingsSection
      title="Scope"
      description="Root folder this account can access. Leave blank to use the global default."
    >
      <SettingsRow stacked :label="t('settings.scope')">
        <input
          id="scope"
          v-model="user.scope"
          type="text"
          :disabled="createUserDirData ?? false"
          :placeholder="scopePlaceholder"
          class="settings-input"
        />
      </SettingsRow>
      <SettingsRow
        v-if="displayHomeDirectoryCheckbox"
        :label="t('settings.createUserHomeDirectory')"
        description="Generate a personal home directory under the configured base path."
      >
        <Toggle v-model="createUserDirData" />
      </SettingsRow>
    </SettingsSection>

    <!-- ── Permissions ─────────────────────────────────────────────── -->
    <SettingsSection
      :title="t('settings.permissions')"
      :description="t('settings.permissionsHelp')"
    >
      <SettingsRow
        :label="t('settings.administrator')"
        description="Grants every permission and unlocks every page. Bypasses the lock-password setting."
      >
        <Toggle v-model="admin" />
      </SettingsRow>
      <SettingsRow
        v-for="p in permissionDefs"
        :key="p.key"
        :label="p.label"
        :description="p.description"
      >
        <Toggle
          v-if="user.perm"
          :modelValue="!!user.perm[p.key]"
          :disabled="admin || (user.perm && p.alsoLockedBy?.(user.perm))"
          @update:modelValue="(v) => user.perm && (user.perm[p.key] = v)"
        />
      </SettingsRow>
    </SettingsSection>

    <!-- ── Commands (exec-only) ────────────────────────────────────── -->
    <SettingsSection
      v-if="enableExec"
      title="Allowed shell commands"
      description="Comma-separated list of commands the user is allowed to execute. Leave blank to disable."
      :has-rows="false"
    >
      <div class="user-form__legacy">
        <Commands v-model:commands="user.commands" />
      </div>
    </SettingsSection>

    <!-- ── Rules ───────────────────────────────────────────────────── -->
    <SettingsSection
      v-if="!isDefault"
      :title="t('settings.rules')"
      :description="t('settings.rulesHelp')"
      :has-rows="false"
    >
      <div class="user-form__legacy">
        <Rules v-model:rules="user.rules" />
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import Toggle from "@/components/settings/Toggle.vue";
import Rules from "./Rules.vue";
import Commands from "./Commands.vue";
import { enableExec } from "@/utils/constants";

const { t } = useI18n();

const createUserDirData = ref<boolean>(false);
const originalUserScope = ref<string | null>(null);

const props = withDefaults(
  defineProps<{
    user: IUserForm;
    isNew: boolean;
    isDefault: boolean;
    createUserDir?: boolean;
    minimumPasswordLength?: number;
  }>(),
  { minimumPasswordLength: 1 }
);

// Highlight the password input when the typed password is below the global
// minimum length. Only meaningful during create — for existing users an
// empty field means "don't change" and should NOT be flagged red.
const passwordTooShort = computed(() => {
  if (!props.isNew) return false;
  const pwd = props.user.password ?? "";
  if (pwd.length === 0) return false; // empty = neutral, button is disabled separately
  return pwd.length < props.minimumPasswordLength;
});

onMounted(() => {
  if (props.user.scope) {
    originalUserScope.value = props.user.scope;
    createUserDirData.value = props.createUserDir ?? false;
  }
});

const passwordPlaceholder = computed(() =>
  props.isNew ? "" : t("settings.avoidChanges")
);
const scopePlaceholder = computed(() =>
  createUserDirData.value ? t("settings.userScopeGenerationPlaceholder") : ""
);
const displayHomeDirectoryCheckbox = computed(
  () => props.isNew && createUserDirData.value !== null
);

/**
 * Wrap perm.admin so toggling it ON cascades every other permission ON
 * (matches the legacy behavior — admin == "has everything").
 */
const admin = computed<boolean>({
  get: () => !!props.user.perm?.admin,
  set: (value) => {
    if (!props.user.perm) return;
    if (value) {
      for (const key of Object.keys(props.user.perm) as Array<
        keyof UserPermissions
      >) {
        props.user.perm[key] = true;
      }
    }
    props.user.perm.admin = value;
  },
});

// Cleanly type-key against UserPermissions (the project's perm type, post-
// Stage-11a rename — used to collide with the global DOM `Permissions`
// interface, which is why the workaround string-union previously lived
// here). The string union still documents which perms are surfaced.
type PermKey =
  | "create"
  | "rename"
  | "modify"
  | "delete"
  | "download"
  | "share"
  | "execute";

interface PermissionDef {
  key: PermKey;
  label: string;
  description: string;
  /** Returns true when this permission must also be on for a parent reason. */
  alsoLockedBy?: (perm: UserPermissions) => boolean;
}

const permissionDefs = computed<PermissionDef[]>(() => {
  const defs: PermissionDef[] = [
    {
      key: "create",
      label: t("settings.perm.create"),
      description: "Upload, create new folders and files.",
    },
    {
      key: "rename",
      label: t("settings.perm.rename"),
      description: "Rename and move existing items.",
    },
    {
      key: "modify",
      label: t("settings.perm.modify"),
      description: "Edit existing file contents.",
    },
    {
      key: "delete",
      label: t("settings.perm.delete"),
      description: "Permanently remove files and folders.",
    },
    {
      key: "download",
      label: t("settings.perm.download"),
      description: "Download files as attachments or zip archives.",
      // Sharing implies downloading
      alsoLockedBy: (p) => !!p.share,
    },
    {
      key: "share",
      label: t("settings.perm.share"),
      description: "Create public share links. Implies download.",
    },
  ];
  if (enableExec) {
    defs.splice(3, 0, {
      key: "execute",
      label: t("settings.perm.execute"),
      description: "Run shell commands from the file editor.",
    });
  }
  return defs;
});

// Admins always have all perms — keep lockPassword off so the password field
// stays editable for the admin themselves. Watch perm.admin SPECIFICALLY
// (not the whole user object deeply) — a deep watch on `user` walked the
// entire reactive proxy tree on every keystroke in any text field, which
// caused noticeable input lag.
watch(
  () => props.user?.perm?.admin,
  (isAdmin) => {
    if (!isAdmin) return;
    if (props.user) props.user.lockPassword = false;
  }
);

// When share is toggled on, download is forced on too (the backend rejects
// share-without-download).
watch(
  () => props.user?.perm?.share,
  (isShare) => {
    if (isShare && props.user?.perm) {
      props.user.perm.download = true;
    }
  }
);

// Toggling the "create home dir" switch clears or restores the scope field.
watch(createUserDirData, () => {
  if (props.user?.scope !== undefined) {
    props.user.scope = createUserDirData.value
      ? ""
      : (originalUserScope.value ?? "");
  }
});
</script>

<style scoped>
.user-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.settings-input:disabled {
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-3, #a1a1aa);
  cursor: not-allowed;
}

.settings-input.is-error {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
}

.settings-input.is-error:focus {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.25);
}

.settings-helper {
  margin: 4px 0 0;
  font-size: 11.5px;
}

.settings-helper--error {
  color: #dc2626;
}

/* Legacy slot for Commands/Rules until those components are rebuilt. Keep
   the surrounding card chrome but give a subtle padded area inside. */
.user-form__legacy {
  padding: 14px 18px;
}

/* Tame the legacy inputs/checkboxes inside the slot so they don't crash
   the page styling. */
.user-form__legacy :deep(input[type="text"]),
.user-form__legacy :deep(input[type="number"]) {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  font-size: 12.5px;
  margin-bottom: 6px;
}

.user-form__legacy :deep(h3) {
  font-size: 12.5px;
  font-weight: 600;
  margin: 4px 0 8px;
  color: var(--color-ink-1, #18181b);
}

.user-form__legacy :deep(.small) {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}
</style>
