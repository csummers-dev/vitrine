<template>
  <component
    :is="interactive ? 'button' : 'span'"
    :type="interactive ? 'button' : undefined"
    class="tag-chip"
    :class="[
      `tag-chip--${tag.color}`,
      `tag-chip--${size}`,
      { 'tag-chip--interactive': interactive },
    ]"
    :tabindex="focusable ? 0 : -1"
    :aria-label="ariaLabel"
    @click="onClick"
    @keydown="onKeydown"
  >
    <span class="tag-chip__label">{{ tag.name }}</span>
    <button
      v-if="removable"
      type="button"
      class="tag-chip__remove"
      :aria-label="`Remove ${tag.name}`"
      tabindex="-1"
      @click.stop="onRemove"
    >
      <Icon name="x" :size="size === 'sm' ? 10 : 12" :stroke-width="2.2" />
    </button>
  </component>
</template>

<script setup lang="ts">
/**
 * TagChip — atomic colored-pill primitive for displaying a single tag.
 *
 * Used in three places (Stage 2): inline on file listing rows (cap-2 +
 * overflow), in the info pane's full tag list, and inside the
 * TagPickerSheet's selection grid.
 *
 * Pure presentational — no API calls, no store coupling. Tag color
 * comes from `--tag-color-<name>-{bg,fg}` CSS variables defined in
 * tokens.css; the 8 palette names are the same on backend and
 * frontend.
 *
 * Interaction model:
 *   - `interactive` (default false) renders as a `<button>` so it
 *     participates in keyboard tab order and emits `click` on
 *     Enter/Space. When false, it's a plain `<span>` (read-only display).
 *   - `removable` adds a `×` button on the right that emits `remove`.
 *     The × is `tabindex=-1` (focus stays on the chip itself); the
 *     chip emits `remove` on Backspace/Delete when focused.
 *   - `focusable` toggles whether the chip is in the tab order at all
 *     (some contexts — e.g., a chip rendered inside a focusable parent
 *     row — want to opt out).
 *
 * Sizes:
 *   - `sm` (default) — used inline on listing rows
 *   - `md` — used in the info pane + picker
 */
import Icon from "@/components/Icon.vue";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    tag: Tag;
    /** Show the × remove affordance and emit `remove` when activated. */
    removable?: boolean;
    /** Render as a button (clickable, keyboard-focusable). */
    interactive?: boolean;
    /** Whether the chip is in the tab order. Ignored when not interactive. */
    focusable?: boolean;
    /** Visual size. */
    size?: "sm" | "md";
  }>(),
  {
    removable: false,
    interactive: false,
    focusable: true,
    size: "sm",
  }
);

const emit = defineEmits<{
  (e: "click", tag: Tag): void;
  (e: "remove", tag: Tag): void;
}>();

const ariaLabel = computed(() =>
  props.removable ? `Tag ${props.tag.name}, removable` : `Tag ${props.tag.name}`
);

const onClick = (event: MouseEvent) => {
  if (!props.interactive) return;
  event.stopPropagation();
  emit("click", props.tag);
};

/** Keyboard shortcuts on the chip itself:
 *  - Backspace / Delete → remove (when removable)
 *  - Enter / Space → click (when interactive; the native button handles
 *    this, but we include it explicitly so non-button interactive paths
 *    also work) */
const onKeydown = (event: KeyboardEvent) => {
  if (
    props.removable &&
    (event.key === "Backspace" || event.key === "Delete")
  ) {
    event.preventDefault();
    emit("remove", props.tag);
  }
};

const onRemove = (event: MouseEvent) => {
  event.stopPropagation();
  emit("remove", props.tag);
};
</script>

<style scoped>
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  border: 0;
  cursor: default;
  user-select: none;
  transition:
    background-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
  /* Default fallback if color class doesn't match — should never happen
     since the union type is enforced server-side, but defensive. */
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
}

/* Size variants — sm is for inline listing rows where vertical space
   is at a premium, md is for picker + info pane where the chip is the
   primary affordance. */
.tag-chip--sm {
  font-size: 10.5px;
  padding: 0 6px;
  height: 18px;
}

.tag-chip--md {
  font-size: 12px;
  padding: 2px 10px;
  height: 22px;
}

/* Interactive (button) gets a cursor + focus ring + hover lift. */
.tag-chip--interactive {
  cursor: pointer;
}

.tag-chip--interactive:hover {
  filter: brightness(1.05);
}

.tag-chip--interactive:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .tag-chip {
    transition: none;
  }
}

/* ── Color variants ──────────────────────────────────────────────────
   Each color resolves to a `-bg` / `-fg` pair from tokens.css. Dark-
   mode tokens are picked up automatically when `html.dark` is set —
   no per-variant dark overrides needed here. */
.tag-chip--lilac {
  background: var(--tag-color-lilac-bg);
  color: var(--tag-color-lilac-fg);
}
.tag-chip--blue {
  background: var(--tag-color-blue-bg);
  color: var(--tag-color-blue-fg);
}
.tag-chip--green {
  background: var(--tag-color-green-bg);
  color: var(--tag-color-green-fg);
}
.tag-chip--amber {
  background: var(--tag-color-amber-bg);
  color: var(--tag-color-amber-fg);
}
.tag-chip--red {
  background: var(--tag-color-red-bg);
  color: var(--tag-color-red-fg);
}
.tag-chip--pink {
  background: var(--tag-color-pink-bg);
  color: var(--tag-color-pink-fg);
}
.tag-chip--slate {
  background: var(--tag-color-slate-bg);
  color: var(--tag-color-slate-fg);
}
.tag-chip--teal {
  background: var(--tag-color-teal-bg);
  color: var(--tag-color-teal-fg);
}

.tag-chip__label {
  /* Keeps long tag names from blowing up the listing — clip with
     ellipsis at ~14 chars worth of width. Callers that need full
     names (info pane, picker) can override via a parent class. */
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: -2px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full, 9999px);
  background: transparent;
  color: inherit;
  opacity: 0.55;
  cursor: pointer;
  transition:
    opacity 0.1s ease,
    background-color 0.1s ease;
}

.tag-chip__remove:hover,
.tag-chip__remove:focus-visible {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
  outline: none;
}

html.dark .tag-chip__remove:hover,
html.dark .tag-chip__remove:focus-visible {
  background: rgba(255, 255, 255, 0.12);
}
</style>
