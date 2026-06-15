<template>
  <BaseModal v-if="open" @closed="emit('cancel')">
    <div class="confirm-prompt" @click.stop>
      <div class="confirm-prompt__body">
        <div class="confirm-prompt__icon is-info">
          <Icon :name="icon" :size="18" :stroke-width="1.6" />
        </div>
        <div class="confirm-prompt__text">
          <h2 class="confirm-prompt__title">{{ title }}</h2>
          <p v-if="message" class="confirm-prompt__message">{{ message }}</p>
          <input
            ref="inputEl"
            v-model="value"
            type="text"
            class="pane-name__input"
            :placeholder="placeholder"
            :maxlength="255"
            spellcheck="false"
            autocomplete="off"
            @keydown.enter.prevent="submit"
            @focus="selectName"
          />
        </div>
      </div>
      <div class="confirm-prompt__actions">
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--ghost"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--primary"
          :disabled="!value.trim()"
          @click="submit"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * PaneNamePrompt — a small controlled name-input modal (new folder / new file /
 * rename) used by the second pane, which has its own action surface rather than
 * pane A's inline-edit rows. Reuses the shared `.confirm-prompt` chrome + the
 * BaseModal primitive; fully parent-driven via `open` + the confirm/cancel
 * emits so a single instance serves every name action.
 */
import { nextTick, ref, watch } from "vue";
import BaseModal from "@/components/prompts/BaseModal.vue";
import Icon from "@/components/Icon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message?: string;
    icon?: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    /** Rename: pre-select the stem before the extension (Finder-style). */
    selectBaseName?: boolean;
  }>(),
  {
    message: "",
    icon: "folder-plus",
    initialValue: "",
    placeholder: "",
    confirmLabel: "Create",
    selectBaseName: false,
  }
);

const emit = defineEmits<{
  (e: "confirm", value: string): void;
  (e: "cancel"): void;
}>();

const value = ref<string>("");
const inputEl = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    value.value = props.initialValue;
    void nextTick(() => {
      inputEl.value?.focus();
      selectName();
    });
  }
);

const selectName = () => {
  const el = inputEl.value;
  if (!el) return;
  if (props.selectBaseName) {
    const dot = value.value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : value.value.length);
  } else {
    el.select();
  }
};

const submit = () => {
  const v = value.value.trim();
  if (v) emit("confirm", v);
};
</script>

<style scoped>
.pane-name__input {
  margin-top: 12px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-1, #18181b);
  font-family: inherit;
  font-size: 13.5px;
  transition:
    border-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}
.pane-name__input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
}
.pane-name__input:focus {
  outline: none;
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.25));
}
</style>
