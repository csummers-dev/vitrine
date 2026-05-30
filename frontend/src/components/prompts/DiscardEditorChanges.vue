<template>
  <div class="confirm-prompt" @click.stop>
    <div class="confirm-prompt__body">
      <div class="confirm-prompt__icon is-warn">
        <Icon name="triangle-alert" :size="18" :stroke-width="1.6" />
      </div>
      <div class="confirm-prompt__text">
        <h2 class="confirm-prompt__title">Unsaved changes</h2>
        <p class="confirm-prompt__message">
          {{ $t("prompts.discardEditorChanges") }}
        </p>
      </div>
    </div>
    <div class="confirm-prompt__actions">
      <button
        type="button"
        class="confirm-prompt__btn confirm-prompt__btn--ghost"
        @click="layoutStore.closeHovers"
      >
        {{ $t("buttons.cancel") }}
      </button>
      <button
        id="focus-prompt"
        type="button"
        class="confirm-prompt__btn confirm-prompt__btn--danger"
        @click="layoutStore.currentPrompt?.confirm?.()"
      >
        {{ $t("buttons.discardChanges") }}
      </button>
      <button
        type="button"
        class="confirm-prompt__btn confirm-prompt__btn--primary"
        @click="layoutStore.currentPrompt?.saveAction?.()"
      >
        {{ $t("buttons.saveChanges") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLayoutStore } from "@/stores/layout";
import Icon from "@/components/Icon.vue";

const layoutStore = useLayoutStore();
</script>
