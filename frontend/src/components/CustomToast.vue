<template>
  <div class="ct">
    <span class="ct__message">{{ message }}</span>
    <button
      v-if="isReport"
      type="button"
      class="ct__action"
      @click.stop="clicked"
    >
      {{ reportText }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  reportText?: string;
  isReport?: boolean;
}>();

const clicked = () => {
  window.open("https://github.com/filebrowser/filebrowser/issues/new/choose");
};
</script>

<style scoped>
/* Tight, single-line toast body that respects the app's design tokens.
   Sized so the wrapper toast container (vue-toastification chrome) doesn't
   balloon. The wrapper itself is styled via the global override in
   styles.css so all toasts share consistent chrome. */
.ct {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-sans, system-ui);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: inherit;
  min-width: 0;
}

.ct__message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ct__action {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.ct__action:hover {
  background: rgba(255, 255, 255, 0.16);
}
</style>
