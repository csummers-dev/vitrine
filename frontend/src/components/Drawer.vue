<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="open"
        class="drawer__scrim"
        @click.self="onCancel"
        @keydown.esc.stop="onCancel"
      >
        <aside
          ref="panel"
          class="drawer"
          :class="[`drawer--${side}`, widthClass]"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          @click.stop
          @touchstart.passive="onPanelTouchStart"
          @touchmove.passive="onPanelTouchMove"
          @touchend.passive="onPanelTouchEnd"
          @touchcancel.passive="onPanelTouchEnd"
        >
          <slot />
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useFocusTrap } from "@/composables/useFocusTrap";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** Which edge the drawer slides in from. */
    side?: "left" | "right";
    /** Override the default 280px width. */
    width?: string;
  }>(),
  { side: "left", width: "280px" }
);

const emit = defineEmits<{
  (e: "cancel"): void;
}>();

const widthClass = computed(() => "");
const onCancel = () => emit("cancel");

// ── Swipe-to-close ──────────────────────────────────────────────────────
// Drag the open panel back toward its own edge (left drawer → swipe left;
// right drawer → swipe right) to dismiss it. Requires a predominantly
// horizontal gesture past a threshold so it never fires on a vertical scroll
// of the drawer's content. Listeners are passive (we never preventDefault),
// so scrolling the favorites / recents lists stays smooth.
const SWIPE_CLOSE = 56;
let cStartX = 0;
let cStartY = 0;
let cTracking = false;

const onPanelTouchStart = (e: TouchEvent) => {
  const t = e.touches[0];
  if (!t) {
    cTracking = false;
    return;
  }
  cStartX = t.clientX;
  cStartY = t.clientY;
  cTracking = true;
};

const onPanelTouchMove = (e: TouchEvent) => {
  if (!cTracking) return;
  const t = e.touches[0];
  if (!t) return;
  const dx = t.clientX - cStartX;
  const dy = t.clientY - cStartY;
  // Vertical intent → it's a scroll, not a dismiss.
  if (Math.abs(dx) < Math.abs(dy)) {
    cTracking = false;
    return;
  }
  const closing = props.side === "left" ? dx < -SWIPE_CLOSE : dx > SWIPE_CLOSE;
  if (closing) {
    cTracking = false;
    onCancel();
  }
};

const onPanelTouchEnd = () => {
  cTracking = false;
};

// Focus trap: keeps Tab/Shift+Tab cycling inside the drawer while open
// and restores focus to the trigger (hamburger button) on close.
const panel = ref<HTMLElement | null>(null);
useFocusTrap(panel, toRef(props, "open"));

// Lock body scroll while the drawer is open so the page underneath
// doesn't scroll independently. Restored on close.
watch(
  () => props.open,
  (open) => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
  }
);
</script>

<style scoped>
.drawer__scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  z-index: 1002; /* above slide-overs (1001) so nested drawers stack */
}

.drawer {
  height: 100%;
  /* Dynamic viewport height where supported: on mobile the address bar can
     make 100% taller than the visible area, pushing the drawer's footer
     out of view. dvh tracks the actually-visible height. */
  height: 100dvh;
  background: var(--color-surface, #fff);
  border-right: 1px solid var(--color-line, #ececec);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 24px 0 48px -12px rgba(0, 0, 0, 0.18);
}

.drawer--left {
  /* Width is set via inline style on usage; we hard-code 280px default */
  width: min(280px, 86vw);
  margin-right: auto;
}

.drawer--right {
  width: min(280px, 86vw);
  margin-left: auto;
  border-right: 0;
  border-left: 1px solid var(--color-line, #ececec);
  box-shadow: -24px 0 48px -12px rgba(0, 0, 0, 0.18);
}

/* ── Transitions ──────────────────────────────────────────────────── */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.18s ease;
}

.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer--left,
.drawer-leave-to .drawer--left {
  transform: translateX(-100%);
}

.drawer-enter-from .drawer--right,
.drawer-leave-to .drawer--right {
  transform: translateX(100%);
}
</style>
