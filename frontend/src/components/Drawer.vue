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
