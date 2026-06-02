<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="['toggle', modelValue && 'is-on']"
    @click="onClick"
  >
    <span class="toggle__thumb"></span>
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

const onClick = () => {
  if (props.disabled) return;
  emit("update:modelValue", !props.modelValue);
};
</script>

<style scoped>
.toggle {
  --track-w: 32px;
  --track-h: 18px;
  --thumb: 14px;
  --pad: 2px;
  width: var(--track-w);
  height: var(--track-h);
  border-radius: 999px;
  background: var(--color-ink-4, #d4d4d8);
  border: 0;
  padding: 0;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: background-color var(--dur-base) ease;
}

.toggle:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 2px;
}

.toggle.is-on {
  background: var(--accent-gradient);
}

.toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle__thumb {
  position: absolute;
  top: var(--pad);
  left: var(--pad);
  width: var(--thumb);
  height: var(--thumb);
  border-radius: 50%;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  transition: transform 0.16s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle.is-on .toggle__thumb {
  transform: translateX(calc(var(--track-w) - var(--thumb) - var(--pad) * 2));
}
</style>
