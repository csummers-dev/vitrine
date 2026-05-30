<template>
  <button @click="action" :aria-label="label" :title="label" class="action">
    <Icon v-if="icon" :name="icon" />
    <span>{{ label }}</span>
    <span v-if="counter && counter > 0" class="counter">{{ counter }}</span>
  </button>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useLayoutStore } from "@/stores/layout";

const props = defineProps<{
  icon?: string;
  label?: string;
  counter?: number;
  show?: string;
}>();

const emit = defineEmits<{
  (e: "action"): any;
}>();

const layoutStore = useLayoutStore();

const action = () => {
  if (props.show) {
    layoutStore.showHover(props.show);
  }

  emit("action");
};
</script>
