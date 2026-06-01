<template>
  <div
    class="preview-shell"
    role="region"
    :aria-label="`Preview: ${name}`"
    tabindex="-1"
    @mousemove="$emit('userActivity')"
    @touchstart="$emit('userActivity')"
  >
    <!-- ── Toolbar (canonical 48px header) ───────────────────────────
         Matches the chrome of FileListing's HeaderBar so the user
         doesn't experience a jarring chrome change when entering the
         preview. Sits on `--color-canvas` — no more cinematic black. -->
    <header class="preview-toolbar">
      <button
        class="preview-toolbar__back"
        :title="$t('buttons.close')"
        :aria-label="$t('buttons.close')"
        @click="$emit('close')"
      >
        <Icon name="arrow-left" :size="14" />
        <span class="max-md:hidden">Back</span>
      </button>

      <div class="preview-toolbar__divider"></div>

      <!-- File-type squircle + filename + position counter. The squircle
           tint comes from the file-icon system so it matches the row's
           treatment in the listing — visual continuity. -->
      <div class="preview-toolbar__title">
        <span class="preview-toolbar__icon" :class="iconColorClass">
          <Icon :name="iconName" :size="14" :stroke-width="1.8" />
        </span>
        <div class="preview-toolbar__title-text">
          <div class="preview-toolbar__name">{{ name }}</div>
          <div v-if="positionLabel" class="preview-toolbar__position">
            {{ positionLabel }}
          </div>
        </div>
      </div>

      <!-- Format-specific toolbar controls (zoom, captions, etc.) -->
      <div class="preview-toolbar__format" v-if="$slots['toolbar-format']">
        <slot name="toolbar-format" />
        <div class="preview-toolbar__divider"></div>
      </div>

      <!-- Universal actions cluster — same chrome as FileListing's
           section-title row. Each viewer gets the same set so muscle
           memory transfers. -->
      <div class="preview-toolbar__actions">
        <button
          v-if="canDownload"
          class="preview-toolbar__btn"
          :title="$t('buttons.download')"
          :aria-label="$t('buttons.download')"
          @click="$emit('download')"
        >
          <Icon name="download" :size="14" />
          <span class="max-md:hidden">{{ $t("buttons.download") }}</span>
        </button>
        <button
          v-if="canShare"
          class="preview-toolbar__btn"
          :title="$t('buttons.share')"
          :aria-label="$t('buttons.share')"
          @click="$emit('share')"
        >
          <Icon name="share" :size="14" />
          <span class="max-md:hidden">{{ $t("buttons.share") }}</span>
        </button>
        <div class="preview-toolbar__divider"></div>

        <!-- Info-rail toggle. Filled state when open so the user can see
             at a glance whether the rail is currently visible. -->
        <button
          class="preview-toolbar__btn preview-toolbar__btn--icon"
          :class="{ 'is-active': infoOpen }"
          :title="infoOpen ? 'Hide details' : 'Show details'"
          :aria-label="infoOpen ? 'Hide details' : 'Show details'"
          :aria-pressed="infoOpen"
          @click="$emit('toggleInfo')"
        >
          <Icon
            :name="infoOpen ? 'panel-right-close' : 'panel-right-open'"
            :size="14"
          />
        </button>

        <!-- Close. The Back button on the left covers the same intent;
             this one is closer to the rest of the action cluster, so
             power users right-end their clicks here. -->
        <button
          class="preview-toolbar__btn preview-toolbar__btn--icon preview-toolbar__btn--close"
          :title="$t('buttons.close') + ' (Esc)'"
          :aria-label="$t('buttons.close')"
          @click="$emit('close')"
        >
          <Icon name="x" :size="16" />
        </button>
      </div>
    </header>

    <!-- ── Body: stage (with side-nav arrows) + info rail ────────────
         Two-column flex. The stage fills; the info rail is fixed 320px
         and hides at max-md (replaced by the toolbar Info toggle which
         opens a bottom sheet in the mobile pass). -->
    <div class="preview-shell__body">
      <section class="preview-shell__stage">
        <slot name="stage" />

        <!-- Side navigation arrows. Sit at the inner edge of the stage,
             not floating over the media. Hidden on mobile (use swipe). -->
        <button
          v-if="hasPrevious"
          class="preview-shell__nav preview-shell__nav--prev"
          :title="$t('buttons.previous') + ' (←)'"
          :aria-label="$t('buttons.previous')"
          @click="$emit('prev')"
        >
          <Icon name="chevron-left" :size="16" />
        </button>
        <button
          v-if="hasNext"
          class="preview-shell__nav preview-shell__nav--next"
          :title="$t('buttons.next') + ' (→)'"
          :aria-label="$t('buttons.next')"
          @click="$emit('next')"
        >
          <Icon name="chevron-right" :size="16" />
        </button>
      </section>

      <!-- Info rail (right side, desktop). Slot is optional — the
           shell renders a placeholder if the parent doesn't pass one,
           but every real viewer should pass <PreviewInfoRail>. -->
      <aside v-if="infoOpen" class="preview-shell__info">
        <slot name="info" />
      </aside>
    </div>

    <!-- Mobile info-rail drawer (P7). At < md the inline rail collapses
         and the toolbar's info-toggle opens this right-side drawer
         instead, so users still reach the action grid + properties on
         touch. The drawer primitive owns focus-trap and Esc handling. -->
    <Drawer
      :open="infoOpen && isMobile"
      side="right"
      @cancel="$emit('toggleInfo')"
    >
      <slot name="info" />
    </Drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * Canonical chrome for every file-preview surface. Matches mockup-preview
 * (and -video / -audio / -pdf) exactly. Per-format viewers compose this
 * shell with their own stage + info-rail content via slots.
 *
 * Why a shell component (vs. inlining in Preview.vue): the previous
 * Preview.vue grew to 661 lines mixing toolbar / media / nav / state
 * for every format. Splitting the canonical chrome out lets each
 * format viewer focus on its own concern and inherit a single layout.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "@/components/Icon.vue";
import Drawer from "@/components/Drawer.vue";

const props = defineProps<{
  /** Display filename. Sits next to the squircle in the toolbar. */
  name: string;
  /** Lucide icon name for the file-type squircle (e.g. "image", "video"). */
  iconName: string;
  /** Tailwind / scoped class controlling the squircle tint (e.g. "is-image"). */
  iconColorClass?: string;
  /** Optional position counter shown under the filename (e.g. "3 of 24"). */
  positionLabel?: string;
  /** Whether to show the prev / next nav arrows. */
  hasPrevious?: boolean;
  hasNext?: boolean;
  /** Whether the right-side info rail is currently visible. */
  infoOpen: boolean;
  /** Show/hide universal toolbar buttons based on perms. */
  canDownload?: boolean;
  canShare?: boolean;
}>();
void props;

// Track viewport width so we can swap between the inline info rail and
// the mobile right-side drawer. Threshold matches the .preview-shell__info
// CSS hide breakpoint (max-width: 767px = Tailwind md).
const isMobile = ref(false);
const updateIsMobile = () => {
  isMobile.value = window.matchMedia("(max-width: 767px)").matches;
};

// No focus trap: the preview is now a docked content region beside the
// main sidebar (not a take-over modal), so focus must stay free to reach
// the sidebar. Keyboard nav (←/→, Esc) is handled by a window-level
// listener in Preview.vue, so it works regardless of focus.

onMounted(() => {
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIsMobile);
});

defineEmits<{
  (e: "close"): void;
  (e: "prev"): void;
  (e: "next"): void;
  (e: "download"): void;
  (e: "share"): void;
  (e: "toggleInfo"): void;
  (e: "userActivity"): void;
}>();
</script>

<style scoped>
.preview-shell {
  /* Docked content region: fills the <main> content column (Files.vue's
     root is position:relative as the containing block) so the left sidebar
     stays visible beside the preview instead of being covered. The sidebar
     is a flex *sibling* of <main>, so it never overlaps this surface; the
     high z-index is kept (unchanged) only so Layout-level prompts/toasts —
     which sit above it — keep their existing stacking order. */
  position: absolute;
  inset: 0;
  z-index: 9999;
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-1, #18181b);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-sans, system-ui);
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */
.preview-toolbar {
  height: 48px;
  border-bottom: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
  z-index: 10;
}

.preview-toolbar__back {
  height: 32px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.preview-toolbar__back:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
}

.preview-toolbar__divider {
  width: 1px;
  height: 20px;
  background: var(--color-line, #ececec);
  margin: 0 4px;
  flex-shrink: 0;
}

.preview-toolbar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.preview-toolbar__icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* Default tint — viewers override via :class for file-type colors. */
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
}

/* Per-file-type squircle tints — match the file-icon system locked in
   Stages 1–4. Viewer components pass the right is-* class. */
.preview-toolbar__icon.is-image {
  background: rgba(236, 72, 153, 0.16);
  color: #be185d;
}
.preview-toolbar__icon.is-video {
  background: rgba(99, 102, 241, 0.16);
  color: #4338ca;
}
.preview-toolbar__icon.is-audio {
  background: rgba(250, 204, 21, 0.22);
  color: #a16207;
}
.preview-toolbar__icon.is-pdf {
  background: rgba(244, 63, 94, 0.16);
  color: #be123c;
}
.preview-toolbar__icon.is-text {
  background: rgba(82, 82, 91, 0.12);
  color: #3f3f46;
}
.preview-toolbar__icon.is-archive {
  background: rgba(251, 146, 60, 0.16);
  color: #c2410c;
}
.preview-toolbar__icon.is-epub {
  background: rgba(20, 184, 166, 0.16);
  color: #0f766e;
}
.preview-toolbar__icon.is-csv {
  background: rgba(34, 197, 94, 0.16);
  color: #15803d;
}

html.dark .preview-toolbar__icon.is-image {
  background: rgba(244, 114, 182, 0.22);
  color: #fbcfe8;
}
html.dark .preview-toolbar__icon.is-video {
  background: rgba(129, 140, 248, 0.22);
  color: #c7d2fe;
}
html.dark .preview-toolbar__icon.is-audio {
  background: rgba(250, 204, 21, 0.2);
  color: #fde68a;
}
html.dark .preview-toolbar__icon.is-pdf {
  background: rgba(251, 113, 133, 0.22);
  color: #fecdd3;
}
html.dark .preview-toolbar__icon.is-text {
  background: rgba(161, 161, 170, 0.18);
  color: #e4e4e7;
}
html.dark .preview-toolbar__icon.is-archive {
  background: rgba(251, 146, 60, 0.22);
  color: #fdba74;
}
html.dark .preview-toolbar__icon.is-epub {
  background: rgba(45, 212, 191, 0.22);
  color: #99f6e4;
}
html.dark .preview-toolbar__icon.is-csv {
  background: rgba(74, 222, 128, 0.2);
  color: #bbf7d0;
}

.preview-toolbar__title-text {
  min-width: 0;
  line-height: 1.2;
}
.preview-toolbar__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-toolbar__position {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
}

.preview-toolbar__format,
.preview-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.preview-toolbar__btn {
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
}
.preview-toolbar__btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.preview-toolbar__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}
.preview-toolbar__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.preview-toolbar__btn--icon {
  width: 28px;
  padding: 0;
  justify-content: center;
}
.preview-toolbar__btn.is-active {
  background: var(--color-selected, rgba(94, 106, 210, 0.08));
  color: var(--color-accent, #5e6ad2);
  border-color: transparent;
}
.preview-toolbar__btn--close {
  background: transparent;
  border-color: transparent;
  margin-left: 4px;
}
.preview-toolbar__btn--close:hover:not(:disabled) {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}

/* ── Body ────────────────────────────────────────────────────────────── */
.preview-shell__body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.preview-shell__stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
  background-color: var(--color-canvas, #fafaf9);
  background-image: radial-gradient(
    rgba(24, 24, 27, 0.05) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
}

html.dark .preview-shell__stage {
  background-color: var(--color-canvas);
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px
  );
}

.preview-shell__info {
  width: 320px;
  border-left: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
}

@media (max-width: 767px) {
  .preview-shell__info {
    /* Info rail collapses on mobile — P7 wires a bottom sheet instead. */
    display: none;
  }
}

/* ── Side nav arrows ─────────────────────────────────────────────────── */
.preview-shell__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.12);
  transition:
    background-color 120ms ease,
    color 120ms ease;
  z-index: 5;
}
.preview-shell__nav:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.preview-shell__nav:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 2px;
}
.preview-shell__nav--prev {
  left: 16px;
}
.preview-shell__nav--next {
  right: 16px;
}

@media (max-width: 540px) {
  /* Hide click-target nav arrows on small viewports — swipe / keyboard
     instead. Keeps the stage uncluttered for one-handed use. */
  .preview-shell__nav {
    display: none;
  }
}
</style>
