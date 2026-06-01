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
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.empty-state.is-compact .empty-state__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.empty-state__icon.is-muted {
  /* Subtle accent-tinted chip (a faint lilac → surface sheen) with the icon
     in the accent color — warmer + more on-brand than a flat gray block,
     matching the app's accent-gradient treatment elsewhere. */
  background: linear-gradient(
    140deg,
    var(--color-accent-soft, rgba(94, 106, 210, 0.1)) 0%,
    var(--color-elevated, #f4f4f5) 100%
  );
  color: var(--color-accent, #5e6ad2);
  box-shadow: inset 0 0 0 1px var(--color-accent-soft, rgba(94, 106, 210, 0.1));
}

.empty-state__icon.is-info {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
}

.empty-state__icon.is-danger {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
}

.empty-state__icon.is-warn {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
}

/* Dark-mode tinting for status chips */
html.dark .empty-state__icon.is-danger {
  background: rgba(220, 38, 38, 0.18);
  color: #f87171;
}

html.dark .empty-state__icon.is-warn {
  background: rgba(217, 119, 6, 0.2);
  color: #fbbf24;
}

.empty-state__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  letter-spacing: -0.005em;
}

.empty-state__hint {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
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
