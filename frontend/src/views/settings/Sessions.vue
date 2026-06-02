<template>
  <SettingsPage
    title="Sessions"
    icon="monitor-smartphone"
    accent="var(--c-green)"
    description="Where you're signed in. The app uses a stateless token, so individual devices aren't tracked — but you can revoke every other session at once."
  >
    <SettingsSection
      title="This session"
      description="Details of the token this browser is currently using."
    >
      <SettingsRow label="Signed in" :description="signedInRel">
        <span class="session-value tabular">{{ signedInAbs }}</span>
      </SettingsRow>
      <SettingsRow label="Expires" :description="expiresRel">
        <span class="session-value tabular">{{ expiresAbs }}</span>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Other sessions"
      description="Signs out every other device where you're logged in — handy after a password change or using a shared computer. This device stays signed in."
    >
      <template #footer>
        <button
          type="button"
          class="session-danger-btn"
          :disabled="busy"
          @click="confirmOpen = true"
        >
          <Icon
            :name="busy ? 'loader-circle' : 'log-out'"
            :size="14"
            :class="{ 'session-spin': busy }"
          />
          Sign out all other sessions
        </button>
      </template>
    </SettingsSection>

    <ConfirmDialog
      :open="confirmOpen"
      title="Sign out other sessions?"
      message="Every other device signed in to your account will be logged out on its next request. This device will stay signed in."
      confirm-label="Sign out others"
      cancel-label="Cancel"
      destructive
      @confirm="doRevoke"
      @cancel="confirmOpen = false"
    />
  </SettingsPage>
</template>

<script setup lang="ts">
/**
 * Settings → Sessions (v1.3 S8-3). "Sign out everywhere" — the JWT is
 * stateless, so this device decodes its own token for the current-session
 * info, and the revoke action bumps the server-side session epoch (which
 * invalidates every OTHER token) while swapping in a fresh token here.
 */
import { computed, inject, ref } from "vue";
import { jwtDecode } from "jwt-decode";
import dayjs from "dayjs";
import { useAuthStore } from "@/stores/auth";
import { revokeOtherSessions } from "@/utils/auth";
import SettingsPage from "@/components/settings/SettingsPage.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import Icon from "@/components/Icon.vue";

const authStore = useAuthStore();
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;
const $showError = inject<IToastError>("$showError")!;

const confirmOpen = ref(false);
const busy = ref(false);

// Recomputes when authStore.jwt changes (e.g. after a revoke re-issues a
// fresh token), so the displayed timestamps update in place.
const claims = computed<{ iat?: number; exp?: number }>(() => {
  try {
    return jwtDecode<{ iat?: number; exp?: number }>(authStore.jwt);
  } catch {
    return {};
  }
});

const fmtAbs = (unix?: number) =>
  unix ? dayjs.unix(unix).format("MMM D, YYYY HH:mm") : "—";
const fmtRel = (unix?: number) => (unix ? dayjs.unix(unix).fromNow() : "");

const signedInAbs = computed(() => fmtAbs(claims.value.iat));
const signedInRel = computed(() => fmtRel(claims.value.iat));
const expiresAbs = computed(() => fmtAbs(claims.value.exp));
const expiresRel = computed(() => fmtRel(claims.value.exp));

const doRevoke = async () => {
  confirmOpen.value = false;
  busy.value = true;
  try {
    await revokeOtherSessions();
    $showSuccess("All other sessions have been signed out.");
  } catch (e) {
    $showError(e instanceof Error ? e : "Couldn't revoke other sessions.");
  } finally {
    busy.value = false;
  }
};
</script>

<style scoped>
.session-value {
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  font-variant-numeric: tabular-nums;
}

.session-danger-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: #dc2626;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}
.session-danger-btn:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.06);
  border-color: rgba(220, 38, 38, 0.4);
}
.session-danger-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
html.dark .session-danger-btn {
  color: #f87171;
}

.session-spin {
  animation: session-spin 0.9s linear infinite;
}
@keyframes session-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .session-spin {
    animation: none;
  }
}
</style>
