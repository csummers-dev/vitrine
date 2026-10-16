<template>
  <!-- After a database upgrade, admins are told once where the old database
       went (Phase 6, 5.7). Dismiss clears it on the server, for good. -->
  <div
    v-if="notice"
    class="upgrade-banner"
    role="status"
    data-testid="upgrade-banner"
  >
    <Icon name="circle-check" :size="16" class="upgrade-banner__icon" />
    <p class="upgrade-banner__text">
      <span>vitrine was upgraded to {{ versionName(notice.to) }}.</span>
      <template v-if="notice.backup">
        A copy of the old database is at
        <code class="upgrade-banner__path">{{ notice.backup }}</code
        >.
      </template>
    </p>
    <UiButton size="sm" variant="ghost" :loading="busy" @click="dismiss"
      >Dismiss</UiButton
    >
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import UiButton from "@/components/ui/UiButton.vue";
import { useAuthStore } from "@/stores/auth";
import * as api from "@/api/upgradeNotice";
import type { UpgradeNotice } from "@/api/upgradeNotice";

const authStore = useAuthStore();
const notice = ref<UpgradeNotice | null>(null);
const busy = ref(false);

/** Schema 4 is "4.0", 5 would be "5.0"; 3.x databases have no number. */
const versionName = (schema: number) => `${schema}.0`;

// Admins only; the server refuses everyone else anyway. A failure (an
// older server, an admin still setting up two-factor) just shows nothing.
watch(
  () => (authStore.user?.perm.admin ? authStore.user.id : null),
  async (adminId) => {
    notice.value = null;
    if (adminId === null) return;
    try {
      notice.value = await api.get();
    } catch {
      notice.value = null;
    }
  },
  { immediate: true }
);

const dismiss = async () => {
  busy.value = true;
  try {
    await api.dismiss();
    notice.value = null;
  } catch {
    // Keep it showing; Dismiss can be tried again.
  } finally {
    busy.value = false;
  }
};
</script>

<style scoped>
.upgrade-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 10px 10px 0;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-line);
  background: var(--status-success-soft);
  color: var(--color-ink-1);
  font-size: var(--type-body);
}
.upgrade-banner__icon {
  flex: none;
  color: var(--status-success);
}
.upgrade-banner__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.upgrade-banner__path {
  font-family: var(--font-mono);
  font-size: var(--type-small);
}
@media (max-width: 767px) {
  .upgrade-banner {
    margin: 8px 8px 0;
  }
}
</style>
