<template>
  <div class="confirm-prompt" @click.stop>
    <div class="confirm-prompt__body">
      <div class="confirm-prompt__icon is-danger">
        <Icon name="trash-2" :size="18" :stroke-width="1.6" />
      </div>
      <div class="confirm-prompt__text">
        <h2 class="confirm-prompt__title">Delete user?</h2>
        <p class="confirm-prompt__message">{{ t("prompts.deleteUser") }}</p>
      </div>
    </div>
    <div class="confirm-prompt__actions">
      <UiButton size="sm" @click="layoutStore.closeHovers">
        {{ t("buttons.cancel") }}
      </UiButton>
      <UiButton
        variant="danger"
        size="sm"
        id="focus-prompt"
        @click="layoutStore.currentPrompt?.confirm?.()"
      >
        {{ t("buttons.delete") }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from "@/components/ui/UiButton.vue";
import { useLayoutStore } from "@/stores/layout";
import { useI18n } from "vue-i18n";
import Icon from "@/components/Icon.vue";

const layoutStore = useLayoutStore();
const { t } = useI18n();
</script>
