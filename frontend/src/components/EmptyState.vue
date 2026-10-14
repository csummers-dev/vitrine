<template>
  <div class="empty-state" :class="{ 'is-compact': compact }">
    <div class="empty-state__icon" :class="toneClass">
      <Icon v-if="icon" :name="icon" :size="iconSize" :stroke-width="1.4" />
      <slot v-else name="icon" />
    </div>
    <div v-if="title" class="empty-state__title">{{ title }}</div>
    <div v-if="hint" class="empty-state__hint">{{ hint }}</div>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "@/components/Icon.vue";

const props = withDefaults(
  defineProps<{
    /** Lucide icon name. Alternative: pass an <Icon> via the `icon` slot. */
    icon?: string;
    /** Headline (bold). */
    title?: string;
    /** Short helper text under the title. */
    hint?: string;
    /** Visual treatment for the icon chip. */
    tone?: "muted" | "info" | "danger" | "warn";
    /** Tighter vertical padding. Use inside small surfaces (dropdowns, etc.) */
    compact?: boolean;
    /** Not a prop: the helper text is `hint`. Typed `never` so passing
     *  `message` (which used to be silently dropped) fails the type check. */
    message?: never;
  }>(),
  { tone: "muted", compact: false }
);

const iconSize = computed(() => (props.compact ? 16 : 20));
const toneClass = computed(() => `is-${props.tone}`);
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 44px 20px;
  text-align: center;
}

.empty-state.is-compact {
  padding: 24px 16px;
  gap: 4px;
}

.empty-state__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.empty-state.is-compact .empty-state__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
}

.empty-state__icon.is-muted {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}

.empty-state__icon.is-info {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}

.empty-state__icon.is-danger {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}

.empty-state__icon.is-warn {
  background: var(--status-warning-soft);
  color: var(--status-warning);
}

.empty-state__title {
  font-size: var(--type-ui);
  font-weight: 600;
  color: var(--color-ink-1);
  letter-spacing: -0.005em;
}

.empty-state__hint {
  font-size: var(--type-body);
  color: var(--color-ink-3);
  max-width: 320px;
  line-height: 1.45;
}

.empty-state__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
