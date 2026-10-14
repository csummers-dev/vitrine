<template>
  <div class="confirm-prompt" @click.stop>
    <div class="confirm-prompt__body">
      <div class="confirm-prompt__icon is-warn">
        <Icon name="file" :size="18" :stroke-width="1.6" />
      </div>
      <div class="confirm-prompt__text">
        <h2 class="confirm-prompt__title">{{ $t("prompts.replace") }}</h2>
        <p class="confirm-prompt__message">
          {{ $t("prompts.replaceMessage") }}
        </p>
      </div>
    </div>
    <div class="confirm-prompt__actions">
      <UiButton size="sm" @click="layoutStore.closeHovers">
        {{ $t("buttons.cancel") }}
      </UiButton>
      <UiButton
        variant="danger"
        size="sm"
        id="focus-prompt"
        @click="layoutStore.currentPrompt?.confirm?.()"
      >
        {{ $t("buttons.replace") }}
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        @click="(e: MouseEvent) => layoutStore.currentPrompt?.action?.(e)"
      >
        {{ $t("buttons.continue") }}
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
