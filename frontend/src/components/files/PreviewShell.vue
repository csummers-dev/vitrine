<template>
  <div
    class="preview-shell"
    role="region"
    :aria-label="`Preview: ${name}`"
    tabindex="-1"
    @mousemove="onActivity"
    @touchstart="onActivity"
  >
    <!-- ── Body: stage (full-bleed, floating controls) + full-height info
         rail. V2-J dissolved the 48px header: Back floats top-left, the
         action cluster (download / share / details / close) floats top-right,
         and the per-format controls float in a bottom-centre pill — all over
         the media, so the rail can run edge-to-edge on the right. -->
    <div class="preview-shell__body">
      <section class="preview-shell__stage">
        <!-- Floating Back (top-left) -->
        <button
          class="preview-float preview-float--back"
          :class="{ 'is-idle-hidden': fadeChrome && !controlsVisible }"
          :title="$t('buttons.close')"
          :aria-label="$t('buttons.close')"
          @click="$emit('close')"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="max-md:hidden">Exit</span>
        </button>

        <!-- Floating action cluster (top-right). V3-D #9: download / share /
             close were removed here — every action lives in the details rail,
             and Exit (top-left) + Esc already close. Only the details toggle
             remains, so the user has one obvious "show me the controls" affordance. -->
        <div
          class="preview-float preview-float--actions"
          :class="{ 'is-idle-hidden': fadeChrome && !controlsVisible }"
        >
          <button
            class="preview-float__btn"
            :class="{ 'is-active': infoOpen }"
            :title="infoOpen ? 'Hide details' : 'Show details'"
            :aria-label="infoOpen ? 'Hide details' : 'Show details'"
            :aria-pressed="infoOpen"
            @click="$emit('toggleInfo')"
          >
            <Icon
              :name="infoOpen ? 'panel-right-close' : 'panel-right-open'"
              :size="16"
            />
          </button>
        </div>

        <slot name="stage" />

        <!-- Floating per-format controls (bottom-centre): zoom / fit / page /
             edit. The viewer fills this via the toolbar-format slot.
             V3-D #15: gate on REAL content — audio/comic/video provide the slot
             but all its v-if branches are false, leaving only comment vnodes,
             which used to render as an empty pill (the "small circle" at
             bottom-centre). V3-D #11: fade out after inactivity so the size
             pill in PDF behaves like a media player's chrome. -->
        <div
          v-if="hasFormatControls"
          class="preview-float preview-float--format"
          :class="{ 'is-idle-hidden': !controlsVisible }"
        >
          <slot name="toolbar-format" />
        </div>
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
import {
  Comment,
  Text,
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useSlots,
} from "vue";
import Icon from "@/components/Icon.vue";
import Drawer from "@/components/Drawer.vue";

// V3-I: trimmed to what the floating-controls shell actually consumes. The old
// 48px toolbar (V2-J) and its top-right download/share/close cluster (V3-D #9)
// are gone, so iconName / iconColorClass / canDownload / canShare props and the
// download / share emits they drove were dead — removed here, along with their
// bindings in Preview.vue.
const props = defineProps<{
  /** Display filename — used in the region's aria-label. */
  name: string;
  /** Whether the right-side info rail is currently visible. */
  infoOpen: boolean;
  /** 2.1 #6: when true (comic & PDF), the Exit + details floats fade with the
   *  controls pill on inactivity. Other previews keep them always visible. */
  fadeChrome?: boolean;
}>();
void props;

const emit = defineEmits<{
  (e: "close"): void;
  (e: "toggleInfo"): void;
  (e: "userActivity"): void;
}>();

// V3-D #15: does the toolbar-format slot actually render any controls? The
// parent always *provides* the slot, but for audio/comic/video every branch
// inside it is `v-if`-false, so it resolves to comment placeholders only.
// Treat comment + whitespace-only nodes as "empty" so the floating pill (and
// its stray-circle look) only appears when there's something to show.
const slots = useSlots();
const hasFormatControls = computed(() => {
  const nodes = slots["toolbar-format"]?.() ?? [];
  return nodes.some((n) => {
    if (n.type === Comment) return false;
    if (n.type === Text && String(n.children ?? "").trim() === "") return false;
    return true;
  });
});

// V3-D #11: auto-hide the floating format pill after a spell of inactivity
// (a media-player convention). Any pointer/touch movement over the shell
// reveals it again and restarts the timer. Only the format pill fades — Exit
// and the details toggle stay put so the user can always leave / open details.
const IDLE_HIDE_MS = 2500;
const controlsVisible = ref(true);
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const onActivity = () => {
  emit("userActivity");
  controlsVisible.value = true;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    controlsVisible.value = false;
    idleTimer = null;
  }, IDLE_HIDE_MS);
};

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
  // Kick off the idle timer so the format pill auto-hides even if the user
  // never moves the pointer after opening the preview.
  onActivity();
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIsMobile);
  if (idleTimer) clearTimeout(idleTimer);
});
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

/* ── V2-J floating preview controls (overlay the stage) ──────────────────
   Glassy translucent pills with a blur so they stay legible on any media,
   freeing the header space entirely. */
.preview-float {
  position: absolute;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.preview-float--back {
  top: 14px;
  left: 14px;
  /* 2.1 #4: slightly smaller + tighter so the arrow sits closer to "Exit". */
  height: 30px;
  gap: 3px;
  padding: 0 10px 0 7px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: color-mix(in srgb, var(--color-surface, #fff) 82%, transparent);
  backdrop-filter: blur(8px);
  color: var(--color-ink-1, #18181b);
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    opacity var(--dur-base) ease,
    transform var(--dur-base) ease;
}
.preview-float--back:hover {
  background: var(--color-elevated, #f4f4f5);
}
/* Calm Minimal: the Exit arrow is ink — uniform with the "Exit" label, no color
   pop (was the brand accent). :deep() reaches the svg inside the Icon child. */
.preview-float--back :deep(svg) {
  color: var(--color-ink-1, #18181b);
}
.preview-float--actions {
  top: 14px;
  right: 14px;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--color-line, #ececec);
  background: color-mix(in srgb, var(--color-surface, #fff) 82%, transparent);
  backdrop-filter: blur(8px);
  transition:
    opacity var(--dur-base) ease,
    transform var(--dur-base) ease;
}
/* 2.1 #6: in comic & PDF previews the Exit + details floats fade together with
   the controls pill on inactivity (gated by the fadeChrome prop). They slide up
   a touch and drop pointer events so they can't be clicked while invisible. */
.preview-float--back.is-idle-hidden {
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
}
.preview-float--actions.is-idle-hidden {
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .preview-float--back.is-idle-hidden,
  .preview-float--actions.is-idle-hidden {
    transform: none;
  }
}
.preview-float--format {
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--color-line, #ececec);
  background: color-mix(in srgb, var(--color-surface, #fff) 88%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  max-width: calc(100% - 32px);
  flex-wrap: wrap;
  justify-content: center;
  /* V3-D #11: fade in/out as the controls show/hide on (in)activity. */
  transition:
    opacity var(--dur-base) ease,
    transform var(--dur-base) ease;
}
/* Idle state: slide down + fade, and drop pointer events so it can't be
   clicked while invisible. translateX is preserved so it stays centred. */
.preview-float--format.is-idle-hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .preview-float--format {
    transition: opacity var(--dur-base) ease;
  }
  .preview-float--format.is-idle-hidden {
    transform: translateX(-50%);
  }
}
.preview-float__btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 0;
  background: transparent;
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.preview-float__btn:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}
.preview-float__btn.is-active {
  background: var(--color-selected, rgba(110, 114, 217, 0.08));
  color: var(--color-accent-ink, #6e72d9);
}
.preview-float__btn--close:hover {
  color: var(--c-rose, #fb7185);
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
</style>
