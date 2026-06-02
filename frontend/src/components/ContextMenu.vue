<template>
  <!--
    Teleport to <body> so the popover escapes any ancestor that establishes a
    containing block for fixed positioning. The files header (.header-bar) and
    other chrome carry `backdrop-filter` under the translucent-surfaces theme,
    which traps + clips `position: fixed` descendants to that ancestor's box —
    that silently broke the in-header Sort menu (it opened, but clipped to the
    thin header strip so nothing showed). Teleporting roots the menu at <body>
    so its fixed coords resolve against the viewport, unclipped.
  -->
  <Teleport to="body">
    <Transition name="ctx-menu">
      <div
        v-if="show"
        ref="contextMenu"
        class="context-menu"
        role="menu"
        tabindex="-1"
        :style="{
          top: `${resolvedY}px`,
          left: `${resolvedX}px`,
        }"
        @keydown="onKeydown"
      >
        <!-- Items-based rendering. Preferred for new callers — gives us
           keyboard nav, type-ahead, separators, disabled / destructive
           variants. Falls back to slot rendering when no items prop
           is provided so existing callers (e.g., the section-title
           More dropdown's pre-migration usage) keep working. -->
        <template v-if="items && items.length">
          <template v-for="(item, i) in items" :key="i">
            <div
              v-if="item.type === 'separator'"
              class="context-menu__separator"
              role="separator"
            />
            <div
              v-else-if="item.type === 'header'"
              class="context-menu__header"
              role="presentation"
            >
              {{ item.label }}
            </div>
            <button
              v-else
              type="button"
              class="context-menu__item"
              :class="{
                'context-menu__item--focused': focusedIndex === i,
                'context-menu__item--disabled': item.disabled,
                'context-menu__item--destructive': item.destructive,
              }"
              role="menuitem"
              :tabindex="item.disabled ? -1 : 0"
              :aria-disabled="item.disabled ? 'true' : undefined"
              :data-index="i"
              @click="onItemClick(item)"
              @mouseenter="focusedIndex = i"
            >
              <Icon
                v-if="item.icon"
                :name="item.icon"
                :size="14"
                :stroke-width="1.6"
                class="context-menu__item-icon"
              />
              <span class="context-menu__item-label">{{ item.label }}</span>
              <span
                v-if="item.kbd"
                class="context-menu__item-kbd"
                aria-hidden="true"
              >
                {{ item.kbd }}
              </span>
            </button>
          </template>
        </template>

        <!-- Legacy slot path — preserved for back-compat. Existing callers
           pass <action> components and rely on the click-outside handler
           below to dismiss. -->
        <slot v-else />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * ContextMenu — popover primitive for any kind of menu rooted at a
 * screen coordinate (right-click row menus, header ⋯ dropdowns,
 * breadcrumb hover popovers, etc.).
 *
 * Two usage modes:
 *
 *   1. Items-based (preferred for new callers). Pass an `items` prop
 *      with a typed array; the component renders proper menuitem
 *      buttons with full keyboard nav (↑ / ↓ / Enter / Esc /
 *      type-ahead), separators, disabled state, and a destructive
 *      variant. Click outside or pick an item to dismiss.
 *
 *   2. Slot-based (legacy). Drop arbitrary children into the default
 *      slot. The component positions + dismisses but doesn't manage
 *      focus or keyboard. Used today by the section-title ⋯ menu
 *      (which passes <action> components).
 *
 * Positioning: starts from the (x, y) the caller supplies, then clamps
 * to the viewport — if the menu would overflow the right edge we slide
 * it left; if it would overflow the bottom we flip to render above the
 * cursor. Re-measured on every show.
 */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";

/** A single item in the menu's items array. */
export interface MenuItem {
  /** "item" (default) | "separator" | "header" */
  type?: "item" | "separator" | "header";
  /** Visible label (and the source for type-ahead matching). */
  label?: string;
  /** Icon name from the Lucide set; rendered left of the label. */
  icon?: string;
  /** Action to run when clicked / Enter-pressed. */
  action?: () => void;
  /** Greyed out + unfocusable; rendered but not invokable. */
  disabled?: boolean;
  /** Red tint on hover; reserved for destructive actions (Delete). */
  destructive?: boolean;
  /** Optional shortcut hint, right-aligned (e.g., "⌘C"). */
  kbd?: string;
}

const props = defineProps<{
  show: boolean;
  pos: { x: number; y: number };
  /** When provided, switches to items-based rendering with keyboard
   *  nav + smart positioning. When omitted, the default slot renders
   *  raw children (legacy usage). */
  items?: MenuItem[];
}>();

const emit = defineEmits<{
  (e: "hide"): void;
}>();

const contextMenu = ref<HTMLElement | null>(null);
const focusedIndex = ref<number>(-1);

// ── Positioning ─────────────────────────────────────────────────────
// Both axes are clamped/flipped based on the rendered size. We measure
// after the popover mounts (in a watch + nextTick) so menu width/height
// are real, not assumed.
const measured = ref<{ w: number; h: number }>({ w: 0, h: 0 });

const resolvedX = computed<number>(() => {
  const { w } = measured.value;
  // Right edge of viewport minus 8 px breathing room.
  const max = window.innerWidth - w - 8;
  return Math.max(8, Math.min(props.pos.x, max));
});

const resolvedY = computed<number>(() => {
  const { h } = measured.value;
  // If the menu would overflow the bottom, flip to above the cursor.
  // Otherwise just clamp to a minimum top offset.
  const wouldOverflow = props.pos.y + h + 8 > window.innerHeight;
  if (wouldOverflow) {
    return Math.max(8, props.pos.y - h);
  }
  return Math.max(8, props.pos.y);
});

// ── Lifecycle: measure on show, attach global handlers ──────────────
watch(
  () => props.show,
  async (val) => {
    if (val) {
      // Measure after the DOM paints so width/height are real.
      await nextTick();
      const el = contextMenu.value;
      if (el) {
        measured.value = { w: el.offsetWidth, h: el.offsetHeight };
        // Focus the menu container so keyboard nav works without
        // requiring the user to click an item first.
        el.focus();
        // Pre-focus the first non-disabled item if items-based.
        if (props.items && props.items.length) {
          focusedIndex.value = firstFocusableIndex();
        }
      }
      // Defer the listener registration by a tick so the click that
      // OPENED the menu (which would bubble up to document) doesn't
      // immediately close it again.
      setTimeout(() => {
        document.addEventListener("click", onDocClick);
        document.addEventListener("contextmenu", onDocContextMenu);
      }, 0);
    } else {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("contextmenu", onDocContextMenu);
      focusedIndex.value = -1;
    }
  }
);

onUnmounted(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("contextmenu", onDocContextMenu);
});

// Click anywhere outside the menu → close.
const onDocClick = (e: MouseEvent) => {
  const el = contextMenu.value;
  if (el && !el.contains(e.target as Node)) {
    emit("hide");
  }
};

// A second right-click anywhere → close (lets the consumer open a new
// menu at the new location without seeing the old one flash).
const onDocContextMenu = (e: MouseEvent) => {
  const el = contextMenu.value;
  if (el && !el.contains(e.target as Node)) {
    emit("hide");
  }
};

// ── Item interaction ────────────────────────────────────────────────
const onItemClick = (item: MenuItem) => {
  if (item.disabled) return;
  if (item.action) item.action();
  emit("hide");
};

// ── Keyboard navigation ─────────────────────────────────────────────
const firstFocusableIndex = (): number => {
  const list = props.items;
  if (!list) return -1;
  for (let i = 0; i < list.length; i++) {
    if (isFocusable(list[i])) return i;
  }
  return -1;
};

const isFocusable = (item: MenuItem): boolean =>
  item.type !== "separator" && item.type !== "header" && !item.disabled;

const moveFocus = (delta: number) => {
  const list = props.items;
  if (!list || !list.length) return;
  const start = focusedIndex.value < 0 ? -1 : focusedIndex.value;
  // Wrap-around loop; skip non-focusable items.
  for (let step = 1; step <= list.length; step++) {
    const next = (start + delta * step + list.length) % list.length;
    if (isFocusable(list[next])) {
      focusedIndex.value = next;
      return;
    }
  }
};

// Type-ahead: tracks recent keystrokes so "do" → focuses the first item
// starting with "do" (e.g., "Download"). Resets after 600 ms idle.
let typeBuffer = "";
let typeTimer: number | null = null;

const onTypeahead = (key: string) => {
  const list = props.items;
  if (!list) return;
  if (typeTimer !== null) window.clearTimeout(typeTimer);
  typeBuffer += key.toLowerCase();
  typeTimer = window.setTimeout(() => {
    typeBuffer = "";
    typeTimer = null;
  }, 600);

  // Find next focusable item whose label starts with the buffer.
  const start = focusedIndex.value < 0 ? 0 : focusedIndex.value;
  for (let i = 1; i <= list.length; i++) {
    const idx = (start + i) % list.length;
    const item = list[idx];
    if (!isFocusable(item) || !item.label) continue;
    if (item.label.toLowerCase().startsWith(typeBuffer)) {
      focusedIndex.value = idx;
      return;
    }
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (!props.items || !props.items.length) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveFocus(1);
      return;
    case "ArrowUp":
      event.preventDefault();
      moveFocus(-1);
      return;
    case "Home":
      event.preventDefault();
      focusedIndex.value = firstFocusableIndex();
      return;
    case "End":
      event.preventDefault();
      for (let i = props.items.length - 1; i >= 0; i--) {
        if (isFocusable(props.items[i])) {
          focusedIndex.value = i;
          return;
        }
      }
      return;
    case "Enter":
    case " ":
      event.preventDefault();
      if (focusedIndex.value >= 0) {
        onItemClick(props.items[focusedIndex.value]);
      }
      return;
    case "Escape":
      event.preventDefault();
      emit("hide");
      return;
  }

  // Plain printable character → type-ahead.
  if (
    event.key.length === 1 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    onTypeahead(event.key);
  }
};
</script>

<style scoped>
/* Container chrome lives here so the new items-based path doesn't
   depend on the legacy global styles in css/context-menu.css (which
   still match for slot-based callers via their own .context-menu .action
   rules). */
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 200px;
  max-width: 320px;
  padding: 4px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  box-shadow:
    0 16px 32px -8px rgba(0, 0, 0, 0.16),
    0 4px 8px -2px rgba(0, 0, 0, 0.08);
  outline: none;
  font-family: var(--font-sans, system-ui);
  color: var(--color-ink-1, #18181b);
}

html.dark .context-menu {
  box-shadow:
    0 16px 32px -8px rgba(0, 0, 0, 0.5),
    0 4px 8px -2px rgba(0, 0, 0, 0.3);
}

/* ── Items-based mode ────────────────────────────────────────────── */
.context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) ease,
    color var(--dur-fast) ease;
}

/* Pointer hover + keyboard focus both surface the same focused state.
   We don't use :hover directly so mouse and keyboard stay in sync — the
   parent reflects mouse position into focusedIndex via @mouseenter. */
.context-menu__item--focused {
  background: var(--color-elevated, #f4f4f5);
}

.context-menu__item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.context-menu__item--disabled.context-menu__item--focused {
  background: transparent;
}

.context-menu__item--destructive.context-menu__item--focused {
  background: #fef2f2;
  color: #b91c1c;
}
html.dark .context-menu__item--destructive.context-menu__item--focused {
  background: rgba(127, 29, 29, 0.25);
  color: #fca5a5;
}

.context-menu__item-icon {
  flex-shrink: 0;
  color: var(--color-ink-3, #a1a1aa);
}
.context-menu__item--focused .context-menu__item-icon {
  color: inherit;
}

.context-menu__item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu__item-kbd {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  padding-left: 8px;
  flex-shrink: 0;
}

/* ── Separator + header ──────────────────────────────────────────── */
.context-menu__separator {
  height: 1px;
  margin: 4px 6px;
  background: var(--color-line, #ececec);
}

.context-menu__header {
  padding: 6px 8px 2px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}

/* ── Open/close transition ───────────────────────────────────────── */
.ctx-menu-enter-active {
  transition:
    opacity var(--dur-base) ease,
    transform 0.14s cubic-bezier(0.16, 1, 0.3, 1);
}
.ctx-menu-leave-active {
  transition:
    opacity 0.08s ease,
    transform 0.1s cubic-bezier(0.4, 0, 1, 1);
}
.ctx-menu-enter-from,
.ctx-menu-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .ctx-menu-enter-active,
  .ctx-menu-leave-active {
    transition: none;
  }
}
</style>
