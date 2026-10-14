<template>
  <SettingsSection
    v-if="st?.available"
    title="Two-factor sign-in"
    description="Ask for a code from an authenticator app (1Password, Aegis, Google Authenticator…) after your password."
    data-testid="two-factor"
  >
    <!-- Off -->
    <SettingsRow
      v-if="!st.enabled && !setupData"
      label="Off"
      description="Anyone with your password can sign in."
    >
      <UiButton variant="primary" :disabled="busy" @click="startSetup">
        Set up
      </UiButton>
    </SettingsRow>

    <!-- Setup: scan, then confirm a code -->
    <template v-else-if="setupData && !recoveryCodes">
      <SettingsRow
        stacked
        label="1. Scan this code with your authenticator app"
      >
        <div class="tf-scan">
          <div class="tf-qr">
            <qrcode-vue :value="setupData.uri" :size="160" level="M" />
          </div>
          <div class="tf-manual">
            <span>Or enter this key:</span>
            <code data-testid="two-factor-secret">{{ grouped }}</code>
          </div>
        </div>
      </SettingsRow>
      <SettingsRow stacked label="2. Enter the 6-digit code it shows">
        <form class="tf-confirm" @submit.prevent="confirm">
          <input
            v-model.trim="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="7"
            class="tf-input tf-code"
            aria-label="Authentication code"
          />
          <UiButton
            variant="primary"
            type="submit"
            :disabled="busy || code.length < 6"
          >
            Turn on
          </UiButton>
          <UiButton @click="cancelSetup"> Cancel </UiButton>
        </form>
      </SettingsRow>
    </template>

    <!-- On -->
    <template v-else-if="st.enabled && !recoveryCodes">
      <SettingsRow
        label="On"
        :description="`${st.recoveryCodesLeft} recovery code${st.recoveryCodesLeft === 1 ? '' : 's'} left.`"
      >
        <div class="tf-actions">
          <UiButton :disabled="busy" @click="askPassword('codes')">
            New recovery codes
          </UiButton>
          <UiButton
            variant="danger"
            :disabled="busy"
            @click="askPassword('disable')"
          >
            Turn off
          </UiButton>
        </div>
      </SettingsRow>
      <SettingsRow
        v-if="pending"
        stacked
        :label="
          pending === 'disable'
            ? 'Enter your password to turn it off'
            : 'Enter your password to replace your recovery codes'
        "
      >
        <form class="tf-confirm" @submit.prevent="runPending">
          <input
            v-model="pw"
            type="password"
            autocomplete="current-password"
            class="tf-input"
            aria-label="Current password"
          />
          <UiButton variant="primary" type="submit" :disabled="busy || !pw">
            Confirm
          </UiButton>
          <UiButton @click="pending = null"> Cancel </UiButton>
        </form>
      </SettingsRow>
    </template>

    <!-- Recovery codes, shown once -->
    <SettingsRow
      v-if="recoveryCodes"
      stacked
      label="Save your recovery codes"
      description="Each one works once if you lose your device. They won't be shown again."
    >
      <ol class="tf-codes" data-testid="recovery-codes">
        <li v-for="c in recoveryCodes" :key="c">
          <code>{{ c }}</code>
        </li>
      </ol>
      <div class="tf-actions">
        <UiButton @click="copyCodes">Copy</UiButton>
        <UiButton @click="downloadCodes"> Download </UiButton>
        <UiButton variant="primary" @click="doneCodes">
          I've saved them
        </UiButton>
      </div>
    </SettingsRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import UiButton from "@/components/ui/UiButton.vue";
import { computed, inject, onMounted, ref } from "vue";

/** Fires once two-factor sign-in is on and the recovery codes are saved. */
const emit = defineEmits<{ (e: "done"): void }>();
import QrcodeVue from "qrcode.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { twofactor as api } from "@/api";
import type { TwoFactorStatus } from "@/api/twofactor";
import { copy } from "@/utils/clipboard";

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const st = ref<TwoFactorStatus | null>(null);
const setupData = ref<{ secret: string; uri: string } | null>(null);
const code = ref("");
const recoveryCodes = ref<string[] | null>(null);
const pending = ref<"disable" | "codes" | null>(null);
const pw = ref("");
const busy = ref(false);

const grouped = computed(
  () => setupData.value?.secret.replace(/(.{4})/g, "$1 ").trim() ?? ""
);

const load = async () => {
  try {
    st.value = await api.status();
  } catch {
    st.value = null;
  }
};
onMounted(load);

const run = async (fn: () => Promise<void>) => {
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    $showError(e instanceof Error ? e : String(e));
  } finally {
    busy.value = false;
  }
};

const startSetup = () =>
  run(async () => {
    setupData.value = await api.setup();
    code.value = "";
  });

const cancelSetup = () => {
  setupData.value = null;
  code.value = "";
};

const confirm = () =>
  run(async () => {
    recoveryCodes.value = await api.enable(code.value.replace(/\s/g, ""));
    setupData.value = null;
    $showSuccess("Two-factor sign-in is on.");
    await load();
  });

const askPassword = (what: "disable" | "codes") => {
  pending.value = what;
  pw.value = "";
};

const runPending = () =>
  run(async () => {
    if (pending.value === "disable") {
      await api.disable(pw.value);
      $showSuccess("Two-factor sign-in is off.");
    } else {
      recoveryCodes.value = await api.newRecoveryCodes(pw.value);
    }
    pending.value = null;
    pw.value = "";
    await load();
  });

const codesText = () =>
  `vitrine recovery codes\n\n${(recoveryCodes.value ?? []).join("\n")}\n`;

const copyCodes = async () => {
  try {
    await copy({ text: codesText() });
    $showSuccess("Recovery codes copied.");
  } catch (e) {
    $showError(e instanceof Error ? e : String(e));
  }
};

const downloadCodes = () => {
  const url = URL.createObjectURL(
    new Blob([codesText()], { type: "text/plain" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "vitrine-recovery-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
};

const doneCodes = () => {
  recoveryCodes.value = null;
  if (st.value?.enabled) emit("done");
};
</script>

<style scoped>
.tf-input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-surface);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1);
  outline: none;
}
.tf-input:focus {
  border-color: var(--color-accent);
}

.tf-scan {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.tf-qr {
  padding: 8px;
  border-radius: 8px;
  background: var(--paper);
  line-height: 0;
}
.tf-manual {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-ink-2);
}
.tf-manual code,
.tf-codes code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-ink-1);
  letter-spacing: 0.04em;
}
.tf-confirm,
.tf-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.tf-code {
  width: 9em;
  font-family: var(--font-mono);
  letter-spacing: 0.15em;
}
.tf-codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, max-content));
  gap: 6px 24px;
  margin: 4px 0 12px;
  padding-left: 20px;
}
</style>
