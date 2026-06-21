<script setup lang="ts">
import { computed, type Component } from "vue";
// Explicit, tree-shaken icon map (only the icons the app references) instead of
// `import * from "@lucide/vue"`, which shipped the whole ~2,940-icon set as a
// 727 kB chunk parsed on every cold start. Regenerate after adding an icon:
//   node scripts/generate-icon-registry.mjs
import { iconRegistry } from "@/utils/iconRegistry.generated";

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number | string | null;
    strokeWidth?: number;
  }>(),
  {
    size: null,
    strokeWidth: 1.8,
  }
);

const IconComponent = computed<Component | null>(() => {
  const lookup = iconRegistry[props.name] ?? null;
  if (import.meta.env.DEV && !lookup && props.name) {
    // A name absent from the registry renders nothing (same as any unknown
    // icon always did) — but in dev, flag it so a newly-added icon that needs
    // a registry regen doesn't silently vanish.
    console.warn(
      `[Icon] "${props.name}" is not in the generated registry — run: ` +
        `node scripts/generate-icon-registry.mjs`
    );
  }
  return lookup;
});

const sizeAttr = computed(() => props.size ?? "1em");
</script>

<template>
  <component
    v-if="IconComponent"
    :is="IconComponent"
    :size="sizeAttr"
    :stroke-width="strokeWidth"
    class="icon"
    aria-hidden="true"
  />
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
