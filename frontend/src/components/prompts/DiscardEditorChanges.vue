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
      <UiButton size="sm" data-autofocus @click="layoutStore.closeHovers">
        {{ $t("buttons.cancel") }}
      </UiButton>
      <UiButton
        variant="danger"
        size="sm"
        id="focus-prompt"
        @click="layoutStore.currentPrompt?.confirm?.($event)"
      >
        {{ $t("buttons.discardChanges") }}
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        @click="layoutStore.currentPrompt?.saveAction?.()"
      >
        {{ $t("buttons.saveChanges") }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from "@/components/ui/UiButton.vue";
import { useLayoutStore } from "@/stores/layout";
import Icon from "@/components/Icon.vue";

const layoutStore = useLayoutStore();
</script>
