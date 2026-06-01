<template>
  <Teleport to="body">
    <Transition name="shortcuts">
      <div
        v-if="overlay.isOpen.value"
        class="shortcuts__scrim"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        @click.self="overlay.close"
        @keydown.esc.stop="overlay.close"
      >
        <section ref="dialog" class="shortcuts" tabindex="-1" @click.stop>
          <header class="shortcuts__header">
            <div>
              <h2 id="shortcuts-title" class="shortcuts__title">
                Keyboard shortcuts
              </h2>
              <p class="shortcuts__subtitle">
                Press <kbd class="shortcuts__inlinekbd">?</kbd> any time to open
                this list.
              </p>
            </div>
            <button
              type="button"
              class="shortcuts__close"
              aria-label="Close shortcuts overlay"
              @click="overlay.close"
            >
              <Icon name="x" :size="16" />
            </button>
          </header>

          <div class="shortcuts__body">
            <section
              v-for="group in groups"
              :key="group.id"
              class="shortcuts__group"
            >
              <h3 class="shortcuts__grouptitle">{{ group.label }}</h3>
              <div class="shortcuts__rows">
                <div
                  v-for="(item, i) in group.items"
                  :key="`${group.id}-${i}`"
                  class="shortcuts__row"
                >
                  <div class="shortcuts__keys">
                    <template
                      v-for="(chip, ki) in renderKeys(item.keys)"
                      :key="ki"
                    >
                      <kbd>{{ chip }}</kbd>
                      <span
                        v-if="
                          Array.isArray(item.keys) &&
                          ki < renderKeys(item.keys).length - 1
                        "
                        class="shortcuts__then"
                        >then</span
                      >
                    </template>
                  </div>
                  <div class="shortcuts__desc">{{ item.label }}</div>
                </div>
                <p v-if="group.items.length === 0" class="shortcuts__empty">
                  No shortcuts in this context.
                </p>
              </div>
            </section>
          </div>

          <footer class="shortcuts__footer">
            <span class="shortcuts__hint">
              <kbd class="shortcuts__inlinekbd">Esc</kbd> to close
            </span>
            <button type="button" class="shortcuts__ok" @click="overlay.close">
              Done
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  useShortcuts,
  type ShortcutDefinition,
  type ShortcutGroup,
} from "@/composables/useShortcuts";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";
import { useFocusTrap } from "@/composables/useFocusTrap";
import Icon from "@/components/Icon.vue";

const overlay = useShortcutsOverlay();
const { shortcuts } = useShortcuts();
const dialog = ref<HTMLElement | null>(null);

// Trap Tab inside the dialog and restore focus to the trigger on close
// (e.g. the `?` keypress moves focus back to wherever the user was).
useFocusTrap(dialog, overlay.isOpen);

// Lock body scroll while open.
watch(
  () => overlay.isOpen.value,
  (open) => {
    document.body.style.overflow = open ? "hidden" : "";
  }
);

interface GroupSpec {
  id: ShortcutGroup;
  label: string;
}

const GROUP_SPECS: GroupSpec[] = [
  { id: "navigation", label: "Navigation" },
  { id: "view", label: "View" },
  { id: "files", label: "Files" },
  { id: "help", label: "Help" },
];

const groups = computed(() =>
  GROUP_SPECS.map((spec) => ({
    ...spec,
    items: shortcuts.value.filter((s) => s.group === spec.id),
  })).filter((g) => g.items.length > 0)
);

/**
 * Turn a key descriptor into per-chip labels. Single-key shortcuts render
 * as `["Key"]`; chords render as `["Key1", "Key2"]` so the template can
 * insert a "then" connector between them.
 */
const renderKeys = (keys: ShortcutDefinition["keys"]): string[] => {
  if (typeof keys === "string") return [prettify(keys)];
  return keys.map(prettify);
};

const prettify = (key: string): string => {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
};
</script>

<style scoped>
.shortcuts__scrim {
  position: fixed;
  inset: 0;
  z-index: 1003; /* above drawer (1002), slide-over (1001), palette (1000) */
  /* RC-1: a modal scrim must DARKEN the page in both themes. Using
     --color-ink-1 (the text color) made the scrim near-white in dark mode
     — a bright wash over the dark UI. Fixed dark wash instead. */
  background: rgba(0, 0, 0, 0.55);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(40px, 8vh, 96px) 16px 24px;
}

.shortcuts {
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  font-family: var(--font-sans, system-ui);
  color: var(--color-ink-1, #18181b);
  outline: none;
}

.shortcuts__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--color-line, #ececec);
}

.shortcuts__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.005em;
}

.shortcuts__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
}

.shortcuts__close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.shortcuts__close:hover {
  background: var(--color-hover, var(--color-elevated, #f4f4f5));
  color: var(--color-ink-1, #18181b);
}

.shortcuts__close:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.shortcuts__body {
  padding: 8px 18px 16px;
  overflow-y: auto;
  flex: 1;
}

.shortcuts__group + .shortcuts__group {
  margin-top: 16px;
}

.shortcuts__grouptitle {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin: 12px 0 6px;
}

.shortcuts__rows {
  display: flex;
  flex-direction: column;
}

.shortcuts__row {
  display: grid;
  grid-template-columns: 170px 1fr;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
}

.shortcuts__row + .shortcuts__row {
  border-top: 1px solid var(--color-line, #ececec);
}

.shortcuts__keys {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.shortcuts__keys kbd,
.shortcuts__inlinekbd {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-1, #18181b);
  line-height: 1.4;
  box-shadow: 0 1px 0 var(--color-line, #ececec);
  min-width: 22px;
  text-align: center;
}

.shortcuts__inlinekbd {
  display: inline-block;
}

.shortcuts__then {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  text-transform: lowercase;
  letter-spacing: 0.02em;
}

.shortcuts__desc {
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
  line-height: 1.4;
}

.shortcuts__empty {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  margin: 6px 0 0;
}

.shortcuts__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

.shortcuts__hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.shortcuts__ok {
  height: 30px;
  padding: 0 14px;
  border-radius: 6px;
  background: var(--color-accent, #5e6ad2);
  border: 1px solid var(--color-accent, #5e6ad2);
  color: white;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.shortcuts__ok:hover {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.shortcuts__ok:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

/* Enter / leave — scrim fades + dialog softly lifts. Respects reduced
   motion via the global override added in stage 11a. */
.shortcuts-enter-active,
.shortcuts-leave-active {
  transition: opacity 0.16s ease;
}

.shortcuts-enter-active .shortcuts,
.shortcuts-leave-active .shortcuts {
  transition:
    transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.16s ease;
}

.shortcuts-enter-from,
.shortcuts-leave-to {
  opacity: 0;
}

.shortcuts-enter-from .shortcuts,
.shortcuts-leave-to .shortcuts {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
