<template>
  <SettingsPage
    :title="t('settings.globalSettings')"
    icon="settings-2"
    accent="var(--color-accent)"
    description="System-wide configuration. Applies to every account on this vitrine instance."
  >
    <template v-if="settings">
      <!-- ── General ────────────────────────────────────────────────── -->
      <SettingsSection
        title="General"
        description="Sign-up, login, and password defaults."
      >
        <SettingsRow
          :label="t('settings.allowSignup')"
          description="Show a sign-up form on the login page and let new users register themselves."
        >
          <Toggle v-model="settings.signup" />
        </SettingsRow>
        <SettingsRow
          :label="t('settings.hideLoginButton')"
          description="Hide the sign-in button on the public share page."
        >
          <Toggle v-model="settings.hideLoginButton" />
        </SettingsRow>
        <SettingsRow
          :label="t('settings.createUserDir')"
          description="When a user is created, automatically generate their home directory under the base path."
        >
          <Toggle v-model="settings.createUserDir" />
        </SettingsRow>
        <SettingsRow
          label="Re-open last visited page on login"
          description="When enabled, signing in returns the user to the last /files path they had open in this browser. When disabled, login always lands on the main file listing."
        >
          <Toggle v-model="settings.rememberLastPage" />
        </SettingsRow>
        <SettingsRow
          stacked
          :label="t('settings.userHomeBasePath')"
          description="Filesystem path under which auto-generated home directories live."
        >
          <input
            v-model="settings.userHomeBasePath"
            type="text"
            class="settings-input"
          />
        </SettingsRow>
        <SettingsRow
          :label="t('settings.minimumPasswordLength')"
          description="Minimum number of characters required for any account password."
        >
          <input
            v-model.number="settings.minimumPasswordLength"
            type="number"
            min="1"
            class="settings-input settings-input--num"
          />
        </SettingsRow>
        <SettingsRow
          label="Trash retention (days)"
          description="Items in the Trash older than this are purged automatically. 0 keeps them until deleted by hand."
        >
          <input
            v-model.number="settings.trashRetentionDays"
            type="number"
            min="0"
            class="settings-input settings-input--num"
          />
        </SettingsRow>
        <SettingsRow
          label="Verify copies"
          description="After every background copy (and cross-volume move), re-read the new files and checksum them against the source. A mismatch fails the transfer and keeps the original. Safer, but roughly doubles copy time."
        >
          <Toggle v-model="settings.verifyTransfers" />
        </SettingsRow>
      </SettingsSection>

      <!-- ── Interface ──────────────────────────────────────────────────
           Branding identity (instance name, theme, branding asset path) is
           intentionally NOT editable — the app ships a fixed "vitrine"
           wordmark. Only the optional UI-hiding toggles remain. The
           per-user theme switcher lives in Profile settings (unaffected). -->
      <SettingsSection
        title="Interface"
        description="Hide optional UI elements."
      >
        <SettingsRow
          :label="t('settings.disableExternalLinks')"
          description="Suppress links pointing off-site (help, GitHub, etc.)."
        >
          <Toggle v-model="settings.branding.disableExternal" />
        </SettingsRow>
        <SettingsRow
          :label="t('settings.disableUsedDiskPercentage')"
          description="Hide the storage usage indicator in the sidebar."
        >
          <Toggle v-model="settings.branding.disableUsedPercentage" />
        </SettingsRow>
      </SettingsSection>

      <!-- ── Uploads ────────────────────────────────────────────────── -->
      <SettingsSection
        :title="t('settings.tusUploads')"
        :description="t('settings.tusUploadsHelp')"
      >
        <SettingsRow
          stacked
          :label="t('settings.tusUploadsChunkSize')"
          description="Examples: 20M, 1G, 512K."
        >
          <input
            v-model="formattedChunkSize"
            type="text"
            class="settings-input"
            id="tus-chunkSize"
          />
        </SettingsRow>
        <SettingsRow
          :label="t('settings.tusUploadsRetryCount')"
          description="Times to retry a failing chunk before reporting an upload error."
        >
          <input
            v-model.number="settings.tus.retryCount"
            type="number"
            min="0"
            class="settings-input settings-input--num"
            id="tus-retryCount"
          />
        </SettingsRow>
      </SettingsSection>

      <!-- ── Shell (exec only) ──────────────────────────────────────── -->
      <SettingsSection
        v-if="enableExec"
        :title="t('settings.executeOnShell')"
        :description="t('settings.executeOnShellDescription')"
      >
        <SettingsRow stacked label="">
          <input
            v-model="shellValue"
            type="text"
            placeholder="bash -c, cmd /c, …"
            class="settings-input settings-input--mono"
          />
        </SettingsRow>
      </SettingsSection>

      <!-- ── Global rules ───────────────────────────────────────────── -->
      <SettingsSection
        :title="t('settings.rules')"
        :description="t('settings.globalRules')"
        :has-rows="false"
      >
        <div class="legacy-slot">
          <Rules v-model:rules="settings.rules" />
        </div>
      </SettingsSection>

      <!-- ── Hook commands (exec only) ──────────────────────────────── -->
      <SettingsSection
        v-if="enableExec"
        :title="t('settings.commandRunner')"
        :has-rows="false"
      >
        <template #headerRight>
          <a
            class="settings-link"
            target="_blank"
            rel="noopener"
            href="https://filebrowser.org/command-execution.html#hook-runner"
          >
            <Icon name="external-link" :size="12" />
            Docs
          </a>
        </template>

        <div class="legacy-slot">
          <i18n-t
            keypath="settings.commandRunnerHelp"
            tag="p"
            class="legacy-slot__hint"
            scope="global"
          >
            <code>FILE</code>
            <code>SCOPE</code>
            <a
              class="settings-link"
              target="_blank"
              rel="noopener"
              href="https://filebrowser.org/command-execution.html#hook-runner"
              >{{ t("settings.documentation") }}</a
            >
          </i18n-t>

          <div v-for="(_, key) in settings.commands" :key="key" class="hook">
            <button
              type="button"
              class="hook__header"
              @click="toggleHook(key as string)"
            >
              <Icon
                :name="
                  openHooks.has(key as string)
                    ? 'chevron-down'
                    : 'chevron-right'
                "
                :size="13"
              />
              <span>{{ capitalize(key as string) }}</span>
            </button>
            <textarea
              v-if="openHooks.has(key as string)"
              v-model.trim="commandObject[key]"
              class="hook__textarea"
              rows="4"
            ></textarea>
          </div>
        </div>
      </SettingsSection>

      <!-- ── User defaults ──────────────────────────────────────────── -->
      <SettingsSection
        :title="t('settings.userDefaults')"
        :description="t('settings.defaultUserDescription')"
        :has-rows="false"
      >
        <div class="legacy-slot legacy-slot--padded">
          <UserForm
            :isNew="false"
            :isDefault="true"
            v-model:user="settings.defaults"
          />
        </div>
      </SettingsSection>
    </template>

    <!-- ── Sticky save bar ─────────────────────────────────────────── -->
    <div v-if="settings" class="global-actions">
      <div class="global-actions__hint">Changes apply to all users.</div>
      <button
        type="button"
        class="global-actions__btn global-actions__btn--primary"
        @click="save"
      >
        {{ t("buttons.update") }}
      </button>
    </div>
  </SettingsPage>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { settings as api } from "@/api";
import { useLayoutStore } from "@/stores/layout";
import { enableExec } from "@/utils/constants";

import SettingsPage from "@/components/settings/SettingsPage.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import Toggle from "@/components/settings/Toggle.vue";
import Rules from "@/components/settings/Rules.vue";
import UserForm from "@/components/settings/UserForm.vue";
import Icon from "@/components/Icon.vue";

const { t } = useI18n();
const layoutStore = useLayoutStore();
const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const settings = ref<ISettings | null>(null);
const originalSettings = ref<ISettings | null>(null);
const commandObject = ref<{ [key: string]: string }>({});
const shellValue = ref<string>("");
const openHooks = ref<Set<string>>(new Set());
const debounceTimeout = ref<number | null>(null);

const formattedChunkSize = computed({
  get() {
    return settings.value?.tus?.chunkSize
      ? formatBytes(settings.value.tus.chunkSize)
      : "";
  },
  set(value: string) {
    // Debounce so the user can type freely. parseBytes runs once typing stops.
    if (debounceTimeout.value) clearTimeout(debounceTimeout.value);
    debounceTimeout.value = window.setTimeout(() => {
      if (settings.value) settings.value.tus.chunkSize = parseBytes(value);
    }, 1500);
  },
});

const toggleHook = (key: string) => {
  if (openHooks.value.has(key)) openHooks.value.delete(key);
  else openHooks.value.add(key);
};

const capitalize = (name: string, where: string | RegExp = "_") => {
  if (where === "caps") where = /(?=[A-Z])/;
  const split = name.split(where);
  let out = "";
  for (let i = 0; i < split.length; i++) {
    out += split[i].charAt(0).toUpperCase() + split[i].slice(1) + " ";
  }
  return out.slice(0, -1);
};

const save = async () => {
  if (!settings.value) return;
  const newSettings: ISettings = {
    ...settings.value,
    shell:
      settings.value.shell
        .join(" ")
        .trim()
        .split(" ")
        .filter((s: string) => s !== "") ?? [],
    commands: {},
  };

  const keys = Object.keys(settings.value.commands) as Array<
    keyof SettingsCommand
  >;
  for (const key of keys) {
    const newValue = commandObject.value[key];
    if (!newValue) continue;
    newSettings.commands[key] = newValue
      .split("\n")
      .filter((cmd: string) => cmd !== "");
  }
  newSettings.shell = shellValue.value
    .trim()
    .split(" ")
    .filter((s) => s !== "");

  try {
    await api.update(newSettings);
    $showSuccess(t("settings.settingsUpdated"));
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
};

// Parse user-friendly chunk size ("20M", "1G") to bytes
const parseBytes = (input: string) => {
  const regex = /^(\d+)(\.\d+)?(B|K|KB|M|MB|G|GB|T|TB)?$/i;
  const matches = input.match(regex);
  if (matches) {
    const size = parseFloat(matches[1].concat(matches[2] || ""));
    let unit: string = (matches[3] || "MB").toUpperCase();
    if (!unit.endsWith("B")) unit += "B";
    const units: Record<string, number> = {
      KB: 1024,
      MB: 1024 ** 2,
      GB: 1024 ** 3,
      TB: 1024 ** 4,
    };
    return size * (units[unit] || 1);
  }
  return 1024 ** 2;
};

const formatBytes = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size}${units[unitIndex]}`;
};

onMounted(async () => {
  try {
    layoutStore.loading = true;
    const original: ISettings = await api.get();
    const newSettings: ISettings = { ...original, commands: {} };
    const keys = Object.keys(original.commands) as Array<keyof SettingsCommand>;
    for (const key of keys) {
      newSettings.commands[key] = original.commands[key];
      commandObject.value[key] = original.commands[key]!.join("\n");
    }
    originalSettings.value = original;
    settings.value = newSettings;
    shellValue.value = newSettings.shell.join(" ");
  } catch (err) {
    if (err instanceof Error) $showError(err);
  } finally {
    layoutStore.loading = false;
  }
});

onBeforeUnmount(() => {
  if (debounceTimeout.value) clearTimeout(debounceTimeout.value);
});
</script>

<style scoped>
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
  border-color: var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(110, 114, 217, 0.3));
}

.settings-input--num {
  width: 110px;
}

.settings-input--mono {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
}

/* See note in Profile.vue — let global .fb-select chrome win. */
.settings-select {
  width: 100%;
}

.settings-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-accent, #6e72d9);
  text-decoration: none;
}

.settings-link:hover {
  text-decoration: underline;
}

/* ── Legacy slot (Rules, Hook commands, UserForm in defaults) ───────── */
.legacy-slot {
  padding: 12px 18px 14px;
}

.legacy-slot--padded {
  padding: 16px 18px 18px;
}

.legacy-slot__hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-ink-2, #52525b);
  line-height: 1.5;
}

.legacy-slot :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
  border: 1px solid var(--color-line, #ececec);
}

.legacy-slot :deep(input[type="text"]),
.legacy-slot :deep(input[type="number"]) {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  font-size: 12.5px;
}

.legacy-slot :deep(h3) {
  font-size: 12.5px;
  font-weight: 600;
  margin: 4px 0 8px;
  color: var(--color-ink-1, #18181b);
}

.legacy-slot :deep(.small) {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}

/* ── Hook command rows ──────────────────────────────────────────────── */
.hook {
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  margin-bottom: 6px;
  overflow: hidden;
}

.hook__header {
  width: 100%;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-canvas, #fafaf9);
  border: 0;
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  text-align: left;
}

.hook__header:hover {
  background: var(--color-elevated, #f4f4f5);
}

.hook__textarea {
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--color-ink-1, #18181b);
  outline: none;
  resize: vertical;
  min-height: 80px;
}

.hook__textarea:focus {
  background: var(--color-surface, #fff);
  border-top-color: var(--color-accent, #6e72d9);
}

/* ── Sticky save bar ───────────────────────────────────────────────── */
.global-actions {
  position: sticky;
  bottom: 0;
  margin: 28px -32px -80px;
  padding: 12px 32px;
  display: flex;
  align-items: center;
  gap: 12px;
  /* Solid canvas bg instead of translucent + backdrop-blur. Same fix as
     the User edit page — the blurred sticky bar caused keystroke lag on
     this page (Global is form-heavy). */
  background: var(--color-canvas, #fafaf9);
  border-top: 1px solid var(--color-line, #ececec);
  z-index: 5;
}

.global-actions__hint {
  flex: 1;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}

.global-actions__btn {
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
    border-color 0.1s ease;
}

.global-actions__btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #6e72d9);
  color: white;
}

.global-actions__btn--primary:hover {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #575cc7);
}

@media (max-width: 540px) {
  .global-actions {
    margin: 28px -16px -60px;
    padding: 10px 16px;
  }
}
</style>
