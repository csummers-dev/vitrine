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
    <!-- Phase 6, 6.1: the stage and the details rail are panels, like the
         files view. The stage's header holds the way back to the folder,
         the file's name, previous / next and the details toggle; per-format
         controls float in a pill at the bottom of the media. -->
    <div class="preview-shell__body">
      <section class="preview-shell__stage">
        <header
          class="preview-head"
          :class="{ 'is-idle-hidden': fadeChrome && !controlsVisible }"
        >
          <UiButton
            variant="ghost"
            size="sm"
            icon="arrow-left"
            class="preview-head__back"
            :aria-label="`Back to ${folder || 'the folder'}`"
            :title="`Back to ${folder || 'the folder'} (Esc)`"
            @click="$emit('close')"
            ><span class="preview-head__folder">{{
              folder || "Back"
            }}</span></UiButton
          >
          <h1 class="preview-head__name" :title="name">{{ name }}</h1>
          <div class="preview-head__actions">
            <UiIconButton
              icon="chevron-left"
              size="sm"
              label="Previous file"
              tooltip="Previous file (←)"
              :disabled="!hasPrevious"
              @click="$emit('prev')"
            />
            <UiIconButton
              icon="chevron-right"
              size="sm"
              label="Next file"
              tooltip="Next file (→)"
              :disabled="!hasNext"
              @click="$emit('next')"
            />
            <UiIconButton
              icon="panel-right"
              size="sm"
              label="Details"
              :tooltip="infoOpen ? 'Hide details' : 'Show details'"
              :pressed="infoOpen"
              @click="$emit('toggleInfo')"
            />
          </div>
        </header>

        <div class="preview-shell__media">
          <slot name="stage" />

          <!-- Floating per-format controls (bottom-centre): zoom / fit / page /
               edit. Shown only when the viewer puts real content in the slot,
               and faded after inactivity. -->
          <div
            v-if="hasFormatControls"
            class="preview-float preview-float--format"
            :class="{ 'is-idle-hidden': !controlsVisible }"
          >
            <slot name="toolbar-format" />
          </div>
        </div>
      </section>

      <!-- Details rail (desktop); a drawer on phones, below. -->
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
import Drawer from "@/components/Drawer.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiIconButton from "@/components/ui/UiIconButton.vue";

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
  /** 2.1 #6: when true (comic & PDF), the header fades with the controls
   *  pill on inactivity. Other previews keep it always visible. */
  fadeChrome?: boolean;
  /** The folder the file is in (the Back button's label). */
  folder?: string;
  hasPrevious?: boolean;
  hasNext?: boolean;
}>();
void props;

const emit = defineEmits<{
  (e: "close"): void;
  (e: "toggleInfo"): void;
  (e: "prev"): void;
  (e: "next"): void;
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
  background: var(--color-canvas);
  color: var(--color-ink-1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-sans);
}

/* ── Body: stage and rail as panels (Phase 6, 6.1) ───────────────────── */
.preview-shell__body {
  flex: 1;
  display: flex;
  gap: 10px;
  padding: 10px;
  min-height: 0;
  overflow: hidden;
}

.preview-shell__stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}

.preview-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 48px;
  padding: 0 var(--space-2);
  border-bottom: 1px solid var(--color-line);
  flex-shrink: 0;
  transition:
    opacity var(--dur-base) ease,
    transform var(--dur-base) ease;
}
.preview-head.is-idle-hidden {
  opacity: 0;
  pointer-events: none;
}
.preview-head__back {
  flex-shrink: 0;
  max-width: 30%;
}
.preview-head__folder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-head__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--type-ui);
  font-weight: 600;
  color: var(--color-ink-1);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-head__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.preview-shell__media {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: var(--color-panel);
}

.preview-float {
  position: absolute;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.preview-float--format {
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  gap: 6px;
  padding: 6px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-line);
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-2);
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
.preview-shell__info {
  width: 320px;
  background: var(--color-panel);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
}

@media (max-width: 767px) {
  .preview-shell__body {
    padding: 0;
    gap: 0;
  }
  .preview-shell__stage {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .preview-shell__info {
    /* Info rail collapses on mobile — P7 wires a bottom sheet instead. */
    display: none;
  }
}
</style>
