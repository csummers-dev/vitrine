<template>
  <BaseModal v-if="root.dialogOpen.value" @closed="root.closeDialog">
    <div class="confirm-prompt" @click.stop>
      <div class="confirm-prompt__body">
        <div class="confirm-prompt__icon is-info">
          <Icon name="folder" :size="18" :stroke-width="1.6" />
        </div>
        <div class="confirm-prompt__text">
          <h2 class="confirm-prompt__title">Rename your files home</h2>
          <p class="confirm-prompt__message">
            Set a custom label for your files home. This only changes what the
            sidebar and listing header call it — your files are untouched.
          </p>
          <input
            id="focus-prompt"
            ref="inputEl"
            v-model="value"
            type="text"
            class="root-label__input"
            :placeholder="defaultLabel"
            :maxlength="60"
            spellcheck="false"
            @keydown.enter.prevent="save"
            @focus="selectAll"
          />
          <p class="root-label__hint">
            Leave blank to use the default ("{{ defaultLabel }}").
          </p>
        </div>
      </div>
      <div class="confirm-prompt__actions">
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--ghost"
          @click="root.closeDialog"
        >
          Cancel
        </button>
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--primary"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * RootLabelDialog — edits the custom label for the files root ("My files").
 * Opened from the sidebar quick-link's right-click menu via the useRootLabel
 * singleton. Mounted once in App.vue. Writes through useRootLabel.setRootLabel
 * (a preferences alias — the real storage root is never touched).
 */
import { nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "@/components/prompts/BaseModal.vue";
import Icon from "@/components/Icon.vue";
import { useRootLabel } from "@/composables/useRootLabel";

const { t } = useI18n();
const root = useRootLabel();
const defaultLabel = t("sidebar.myFiles");

const value = ref<string>("");
const inputEl = ref<HTMLInputElement | null>(null);

// Seed the field with the currently-stored label each time the dialog opens.
watch(
  () => root.dialogOpen.value,
  (open) => {
    if (open) {
      value.value = root.rootLabel.value;
      void nextTick(() => inputEl.value?.focus());
    }
  }
);

const selectAll = () => inputEl.value?.select();

const save = () => {
  root.setRootLabel(value.value);
  root.closeDialog();
};
</script>

<style scoped>
.root-label__input {
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

.root-label__input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
}

.root-label__input:focus {
  outline: none;
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.25));
}

.root-label__hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}
</style>
