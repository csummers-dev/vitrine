<template>
  <div
    class="cpw"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cpw-title"
    @click.stop
  >
    <div class="cpw__body">
      <div class="cpw__icon" :class="{ 'is-error': !!error }">
        <Icon
          :name="error ? 'triangle-alert' : 'lock'"
          :size="18"
          :stroke-width="1.6"
        />
      </div>
      <div class="cpw__text">
        <h2 id="cpw-title" class="cpw__title">
          {{ t("prompts.currentPassword") }}
        </h2>
        <p class="cpw__message">
          {{ t("prompts.currentPasswordMessage") }}
        </p>
        <input
          id="focus-prompt"
          ref="inputEl"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="cpw__input"
          :class="{ 'is-error': !!error }"
          :disabled="submitting"
          @input="clearError"
          @keyup.enter="submit"
        />
        <p v-if="error" class="cpw__error">
          {{ error }}
        </p>
      </div>
    </div>
    <div class="cpw__actions">
      <button
        type="button"
        class="cpw__btn cpw__btn--ghost"
        :disabled="submitting"
        @click="cancel"
      >
        {{ t("buttons.cancel") }}
      </button>
      <button
        type="button"
        class="cpw__btn cpw__btn--primary"
        :disabled="password === '' || submitting"
        @click="submit"
      >
        <Icon
          v-if="submitting"
          name="loader-circle"
          :size="13"
          class="cpw__spin"
        />
        <span>{{ submitting ? "Verifying…" : t("buttons.ok") }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useLayoutStore } from "@/stores/layout";
import Icon from "@/components/Icon.vue";

const { t } = useI18n();
const layoutStore = useLayoutStore();
const { currentPrompt } = layoutStore;

const password = ref<string>("");
const inputEl = ref<HTMLInputElement | null>(null);
const submitting = ref<boolean>(false);
const error = ref<string>("");

onMounted(async () => {
  await nextTick();
  inputEl.value?.focus();
});

const clearError = () => {
  // Hide the stale error as soon as the user edits the password — feels
  // more responsive than letting it linger until they re-submit.
  if (error.value) error.value = "";
};

/**
 * Submit flow:
 *   - Call the caller-supplied `confirm` callback (may be sync or async).
 *   - If it resolves successfully, close the modal.
 *   - If it throws or rejects, show the error inline and keep the modal
 *     open so the user can correct the password without losing focus.
 *
 * This contract change is backwards-compatible with the old callers that
 * close the modal themselves — Promise.resolve(undefined) just resolves,
 * we close again on top, no harm done.
 */
const submit = async (event: Event) => {
  if (password.value === "" || submitting.value) return;
  submitting.value = true;
  error.value = "";
  try {
    await Promise.resolve(currentPrompt?.confirm?.(event, password.value));
    layoutStore.closeHovers();
  } catch (e) {
    error.value =
      (e as Error)?.message || "That password didn't work. Please try again.";
    // Keep the password value so the user can fix a typo without retyping
    // the whole thing. Re-focus the field for convenience.
    await nextTick();
    inputEl.value?.focus();
    inputEl.value?.select();
  } finally {
    submitting.value = false;
  }
};

const cancel = () => {
  if (submitting.value) return;
  layoutStore.closeHovers();
};
</script>

<style scoped>
.cpw {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.cpw__body {
  display: flex;
  gap: 14px;
  padding: 18px 18px 16px;
}

.cpw__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.cpw__icon.is-error {
  background: #fef2f2;
  color: #dc2626;
}

.cpw__text {
  flex: 1;
  min-width: 0;
}

.cpw__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  margin: 0;
  letter-spacing: -0.005em;
}

.cpw__message {
  margin: 4px 0 12px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-ink-2, #52525b);
}

.cpw__input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.cpw__input:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}

.cpw__input.is-error {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
}

.cpw__input.is-error:focus {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.25);
}

.cpw__input:disabled {
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-3, #a1a1aa);
  cursor: not-allowed;
}

.cpw__error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #dc2626;
  line-height: 1.4;
}

.cpw__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

.cpw__btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.cpw__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.cpw__btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.cpw__btn--ghost:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.cpw__btn--primary {
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.cpw__btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.cpw__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cpw__spin {
  animation: cpw-spin 0.9s linear infinite;
}

@keyframes cpw-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
