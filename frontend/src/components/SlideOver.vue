<template>
  <Teleport to="body">
    <Transition name="slideover">
      <div
        v-if="open"
        class="slideover__scrim"
        @click.self="onScrimClick"
        @keydown.esc.stop="onCancel"
      >
        <aside
          ref="panel"
          class="slideover"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          :aria-labelledby="`${dialogId}-title`"
          @click.stop
        >
          <!-- Header: title + close. Slot for custom header content if needed. -->
          <header class="slideover__header">
            <div class="slideover__header-text">
              <div v-if="eyebrow" class="slideover__eyebrow">{{ eyebrow }}</div>
              <h2 :id="`${dialogId}-title`" class="slideover__title">
                {{ title }}
              </h2>
            </div>
            <button
              type="button"
              class="slideover__close"
              :aria-label="closeLabel"
              :title="closeLabel"
              @click="onCancel"
            >
              <Icon name="x" :size="14" />
            </button>
          </header>

          <!-- Body: the actual panel content. Scrollable. -->
          <div class="slideover__body">
            <slot />
          </div>

          <!-- Footer: optional actions row. Sticky to bottom of panel. -->
          <footer v-if="$slots.footer" class="slideover__footer">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import Icon from "@/components/Icon.vue";
import { useFocusTrap } from "@/composables/useFocusTrap";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** Small label above the title (e.g. "Move", "Share"). */
    eyebrow?: string;
    closeLabel?: string;
    /** Whether clicking the scrim closes the panel. */
    closeOnScrimClick?: boolean;
  }>(),
  {
    closeLabel: "Close",
    closeOnScrimClick: true,
  }
);

const emit = defineEmits<{
  (e: "cancel"): void;
}>();

const dialogId = computed(() => `so-${Math.random().toString(36).slice(2, 9)}`);

const onCancel = () => emit("cancel");
const onScrimClick = () => {
  if (props.closeOnScrimClick) onCancel();
};

// Focus trap: Tab/Shift+Tab stays inside the panel while open; focus
// returns to the trigger element (the row action / button that opened
// the slide-over) on close.
const panel = ref<HTMLElement | null>(null);
useFocusTrap(panel, toRef(props, "open"));
</script>

<style scoped>
.slideover__scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex;
  justify-content: flex-end;
  z-index: 1001; /* above InfoPane (z-40) and palette scrim (1000) */
}

.slideover {
  width: min(420px, 100vw);
  height: 100%;
  background: var(--color-surface, #fff);
  border-left: 1px solid var(--color-line, #ececec);
  box-shadow: -24px 0 48px -12px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.slideover__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-line, #ececec);
  flex-shrink: 0;
}

.slideover__header-text {
  flex: 1;
  min-width: 0;
}

.slideover__eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-bottom: 2px;
}

.slideover__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  margin: 0;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slideover__close {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.slideover__close:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.slideover__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.slideover__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* Transitions */
.slideover-enter-active,
.slideover-leave-active {
  transition: opacity 0.18s ease;
}
.slideover-enter-active .slideover,
.slideover-leave-active .slideover {
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.slideover-enter-from,
.slideover-leave-to {
  opacity: 0;
}
.slideover-enter-from .slideover,
.slideover-leave-to .slideover {
  transform: translateX(100%);
}

/* Full-width sheet at narrow viewports (same breakpoint as InfoPane sheet) */
@media (max-width: 540px) {
  .slideover {
    width: 100vw;
  }
}
</style>
