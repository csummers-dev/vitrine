<template>
  <div class="undo-toast">
    <span class="undo-toast__icon" aria-hidden="true">
      <Icon :name="icon ?? 'trash-2'" :size="15" :stroke-width="1.8" />
    </span>
    <span class="undo-toast__message">{{ message }}</span>
    <button type="button" class="undo-toast__action" @click.stop="onClick">
      Undo
    </button>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";

defineProps<{
  message: string;
  onClick: () => void;
  /** lucide icon name; defaults to trash-2 (delete). */
  icon?: string;
}>();
</script>

<style scoped>
.undo-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  /* min-width:0 lets this flex child shrink inside the toast body so the
     message can ellipsize/wrap instead of forcing the toast wider than its
     container (the off-screen overflow the user hit). */
  min-width: 0;
  width: 100%;
  color: white;
  font-size: 13px;
  font-weight: 500;
}

.undo-toast__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  color: white;
}

.undo-toast__message {
  flex: 1;
  min-width: 0;
  /* Wrap long file names instead of running off-screen; cap at two lines and
     ellipsize beyond that so a pathological name can't grow a tall toast. Break
     anywhere so an unbroken string (no spaces) still wraps. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.35;
}

.undo-toast__action {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: white;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color var(--dur-base, 0.15s) ease;
  flex-shrink: 0;
  align-self: center;
}

.undo-toast__action:hover {
  background: rgba(255, 255, 255, 0.28);
}
</style>
