<template>
  <Transition name="offline-banner">
    <div v-if="!online" class="offline-banner" role="status" aria-live="polite">
      <Icon name="cloud-off" :size="15" :stroke-width="1.8" />
      <span>You're offline — changes won't save until you reconnect.</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * Global "You're offline" banner (v1.3 S6-4). Driven purely by the
 * browser's connectivity state (`navigator.onLine` + the online/offline
 * events, via @vueuse/core's `useOnline`) — independent of the service
 * worker, so it works whether or not the shell was cached. Pairs with the
 * S6-5 per-view error states: this is the persistent ambient signal,
 * those are the in-place "this fetch failed" overlays.
 *
 * Mounted once at the app root so it shows on every surface, including
 * the login page.
 */
import { useOnline } from "@vueuse/core";
import Icon from "@/components/Icon.vue";

const online = useOnline();
</script>

<style scoped>
.offline-banner {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 2rem);
  padding: 8px 16px;
  border-radius: var(--radius-full, 9999px);
  /* Inverse surface so the pill stays dark in both themes (matches the
     multi-select pill treatment). */
  background: var(--color-inverse-surface, #18181b);
  color: #fff;
  font-size: 12.5px;
  font-weight: 500;
  box-shadow:
    var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.18)),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.offline-banner svg {
  color: var(--status-warning);
  flex-shrink: 0;
}

.offline-banner span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.offline-banner-enter-active,
.offline-banner-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.offline-banner-enter-from,
.offline-banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
.offline-banner-enter-to,
.offline-banner-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .offline-banner-enter-active,
  .offline-banner-leave-active {
    transition: none;
  }
}
</style>
