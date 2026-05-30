<template>
  <div id="modal-background" @click="backgroundClick">
    <div ref="modalContainer">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

const emit = defineEmits(["closed"]);

const modalContainer = ref(null);

// Remembered on mount so we can restore focus to whatever opened the
// modal once it closes (e.g. the row's ⋯ menu item, a header button).
let previouslyFocused: HTMLElement | null = null;

// Esc-to-close handler. Previously this was registered at script-setup top
// level with NO cleanup, so every BaseModal mount added a new permanent
// window keydown listener — they accumulated across the session and fired
// on every keystroke in any input forever. Now scoped to mount/unmount.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.stopImmediatePropagation();
    emit("closed");
  }
};

onMounted(() => {
  previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
  window.addEventListener("keydown", onKeydown);
  const element = document.querySelector("#focus-prompt") as HTMLElement | null;
  if (element) {
    element.focus();
  } else if (modalContainer.value) {
    (modalContainer.value as HTMLElement).focus();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  // Restore focus to the opener so keyboard users don't lose their place.
  if (previouslyFocused && document.contains(previouslyFocused)) {
    try {
      previouslyFocused.focus();
    } catch {
      /* refused focus — nothing to do */
    }
  }
  previouslyFocused = null;
});

const backgroundClick = (event: Event) => {
  const target = event.target as HTMLElement;
  if (target.id == "modal-background") {
    emit("closed");
  }
};
</script>

<style scoped>
#modal-background {
  position: fixed;
  inset: 0;
  /* Match the lighter, blurred scrim used by ConfirmDialog / SlideOver /
     command palette so all modal surfaces share the same chrome. */
  background-color: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 18vh;
  z-index: 10000;
  animation: ease-in 150ms opacity-enter;
}

@keyframes opacity-enter {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
