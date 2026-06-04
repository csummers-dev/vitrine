<template>
  <BaseModal v-if="ap.dialogOpen.value" @closed="ap.cancel">
    <div class="confirm-prompt" @click.stop>
      <div class="confirm-prompt__body">
        <div class="confirm-prompt__icon is-info">
          <Icon name="lock" :size="18" :stroke-width="1.6" />
        </div>
        <div class="confirm-prompt__text">
          <h2 class="confirm-prompt__title">
            {{ t("prompts.archivePassword.title") }}
          </h2>
          <p class="confirm-prompt__message">
            {{ t("prompts.archivePassword.message") }}
          </p>

          <div class="archive-pw__field">
            <input
              id="focus-prompt"
              ref="inputEl"
              v-model="value"
              :type="showPassword ? 'text' : 'password'"
              class="archive-pw__input"
              :class="{ 'is-invalid': ap.incorrect.value }"
              :placeholder="t('prompts.archivePassword.placeholder')"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="submit"
            />
            <button
              type="button"
              class="archive-pw__reveal"
              :aria-label="
                showPassword
                  ? t('prompts.archivePassword.hide')
                  : t('prompts.archivePassword.show')
              "
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </div>

          <p v-if="ap.incorrect.value" class="archive-pw__error">
            {{ t("prompts.archivePassword.incorrect") }}
          </p>
        </div>
      </div>

      <div class="confirm-prompt__actions">
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--ghost"
          @click="ap.cancel"
        >
          {{ t("buttons.cancel") }}
        </button>
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--primary"
          :disabled="!value"
          @click="submit"
        >
          {{ t("prompts.archivePassword.unlock") }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * ArchivePasswordPrompt — the one password dialog for extracting
 * password-protected archives. Mounted once in App.vue; driven by the
 * useArchivePassword singleton (opened from useExtractIndicator's retry loop).
 * Reuses the global .confirm-prompt chrome shared by the other prompts.
 */
import { nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "@/components/prompts/BaseModal.vue";
import Icon from "@/components/Icon.vue";
import { useArchivePassword } from "@/composables/useArchivePassword";

const { t } = useI18n();
const ap = useArchivePassword();

const value = ref("");
const showPassword = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

// Reset the field each time the dialog opens (clear the previous attempt so a
// wrong password doesn't linger), and focus it.
watch(
  () => ap.dialogOpen.value,
  (open) => {
    if (open) {
      value.value = "";
      showPassword.value = false;
      void nextTick(() => inputEl.value?.focus());
    }
  }
);

const submit = () => {
  if (!value.value) return;
  ap.submit(value.value);
};
</script>

<style scoped>
.archive-pw__field {
  position: relative;
  margin-top: 12px;
}

.archive-pw__input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 38px 9px 12px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.14));
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-text, inherit);
  font-size: 0.9rem;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.archive-pw__input:focus {
  border-color: var(--c-lilac, #5e6ad2);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--c-lilac, #5e6ad2) 22%, transparent);
}
.archive-pw__input.is-invalid {
  border-color: #e11d48;
}
.archive-pw__input.is-invalid:focus {
  box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.18);
}

.archive-pw__reveal {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted, rgba(0, 0, 0, 0.5));
  cursor: pointer;
}
.archive-pw__reveal:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.archive-pw__error {
  margin: 8px 0 0;
  color: #e11d48;
  font-size: 0.8rem;
}
</style>
