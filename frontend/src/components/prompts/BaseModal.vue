<template>
  <!-- Teleported to <body> so the dialog escapes the .app-shell stacking
       context (isolation: isolate) and sits above slide-over scrims. -->
  <Teleport to="body">
    <div
      id="modal-background"
      class="ui-dialog-backdrop"
      @click="backgroundClick"
    >
      <div
        ref="modalContainer"
        class="ui-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelId"
        tabindex="-1"
      >
        <slot></slot>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The dialog shell (Phase 6, reworked from the prompt modal): role=dialog
 * named by its heading, focus trapped inside and returned to the opener on
 * close, page scroll locked, Escape and a backdrop click close it unless a
 * request is running (`busy`). On phones it is a bottom sheet.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { useFocusTrap } from "@/composables/useFocusTrap";

const props = defineProps<{
  /** A request is running: Escape and the backdrop don't close. */
  busy?: boolean;
  /** Id of the element that names the dialog; else its first heading. */
  labelledby?: string;
}>();
const emit = defineEmits(["closed"]);

const modalContainer = ref<HTMLElement | null>(null);
const open = ref(false);
const labelId = ref<string | undefined>(props.labelledby);
const autoId = `dlg-${useId()}`;

useFocusTrap(modalContainer, open);

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  event.stopImmediatePropagation();
  if (!props.busy) emit("closed");
};

let previousOverflow = "";

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  await nextTick();
  const root = modalContainer.value;
  if (root && !labelId.value) {
    const heading = root.querySelector<HTMLElement>(
      "h1, h2, h3, .card-title, [data-dialog-title]"
    );
    if (heading) {
      heading.id ||= autoId;
      labelId.value = heading.id;
    }
  }
  // Older prompts mark their default button #focus-prompt.
  root
    ?.querySelector<HTMLElement>("#focus-prompt")
    ?.setAttribute("data-autofocus", "");
  open.value = true;
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = previousOverflow;
});

const backgroundClick = (event: Event) => {
  if ((event.target as HTMLElement).id === "modal-background" && !props.busy)
    emit("closed");
};
</script>

<style scoped>
.ui-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 18vh var(--space-4) var(--space-4);
  background-color: var(--scrim);
  animation: ui-dialog-fade var(--dur-slow) var(--ease);
}
.ui-dialog {
  max-width: 100%;
  max-height: 100%;
  outline: none;
}
@keyframes ui-dialog-fade {
  from {
    opacity: 0;
  }
}
/* Phones: a bottom sheet. */
@media (max-width: 640px) {
  .ui-dialog-backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .ui-dialog {
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
  }
  .ui-dialog > :deep(*) {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>
