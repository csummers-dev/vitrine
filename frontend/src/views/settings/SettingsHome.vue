<template>
  <!-- /settings (Phase 6, 5.4). On phones: the list of sections, each opening
       its page. Wider screens show the rail beside the page, so this route
       goes straight to Profile. -->
  <div class="settings-home" data-testid="settings-home">
    <h1 class="settings-home__title">Settings</h1>
    <SettingsRail variant="list" />
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useRouter } from "vue-router";
import SettingsRail from "@/components/settings/SettingsRail.vue";
import { useWindowWidth } from "@/composables/useWindowWidth";

const router = useRouter();
const width = useWindowWidth();

watch(
  width,
  (w) => {
    if (w >= 768) void router.replace("/settings/profile");
  },
  { immediate: true }
);
</script>

<style scoped>
.settings-home {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.settings-home__title {
  margin: 0;
  padding: var(--space-4) var(--space-4) 0;
  font-size: var(--type-display);
  line-height: var(--type-display-lh);
  font-weight: 700;
  color: var(--color-ink-1);
}
</style>
