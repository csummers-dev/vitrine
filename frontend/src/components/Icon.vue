<script setup lang="ts">
import * as LucideIcons from "@lucide/vue";
import { computed, type Component } from "vue";

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

const toPascal = (s: string) =>
  s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const IconComponent = computed<Component | null>(() => {
  const key = toPascal(props.name);
  const lookup = (LucideIcons as unknown as Record<string, unknown>)[key];
  return (lookup as Component) ?? null;
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
