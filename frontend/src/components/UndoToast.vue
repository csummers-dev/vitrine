<template>
  <div class="undo-toast">
    <Icon name="trash-2" :size="14" :stroke-width="1.6" />
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
}>();
</script>

<style scoped>
.undo-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  color: white;
  font-size: 13px;
  font-weight: 500;
}

.undo-toast__message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-toast__action {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.12s ease;
  flex-shrink: 0;
}

.undo-toast__action:hover {
  background: rgba(255, 255, 255, 0.16);
}
</style>
