<template>
  <!-- A yes/no question (Phase 6, 6.2: on the shared dialog shell, so it
       traps focus, returns it, locks scroll and is a bottom sheet on phones).
       Focus starts on Cancel: the safe choice for destructive actions. -->
  <BaseModal v-if="open" :labelledby="`${dialogId}-title`" @closed="onCancel">
    <div
      class="confirm-prompt"
      data-testid="confirm-dialog"
      @keydown.enter="onEnter"
    >
      <div class="confirm-prompt__body">
        <div
          class="confirm-prompt__icon"
          :class="destructive ? 'is-danger' : 'is-info'"
        >
          <Icon
            :name="destructive ? 'triangle-alert' : 'info'"
            :size="18"
            :stroke-width="1.6"
          />
        </div>
        <div class="confirm-prompt__text">
          <h2 :id="`${dialogId}-title`" class="confirm-prompt__title">
            {{ title }}
          </h2>
          <p v-if="message" class="confirm-prompt__message">{{ message }}</p>
        </div>
      </div>
      <div class="confirm-prompt__actions">
        <UiButton data-autofocus size="sm" @click="onCancel">{{
          cancelLabel
        }}</UiButton>
        <UiButton
          size="sm"
          :variant="destructive ? 'danger' : 'primary'"
          @click="onConfirm"
          >{{ confirmLabel }}</UiButton
        >
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { useId } from "vue";
import Icon from "@/components/Icon.vue";
import UiButton from "@/components/ui/UiButton.vue";
import BaseModal from "@/components/prompts/BaseModal.vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red destructive styling on the confirm button. */
    destructive?: boolean;
  }>(),
  {
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    destructive: false,
  }
);

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const dialogId = `cd-${useId()}`;

const onConfirm = () => emit("confirm");
// Enter confirms, unless it's on a button (Cancel has focus first).
const onEnter = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement | null)?.closest("button")) return;
  e.preventDefault();
  onConfirm();
};
const onCancel = () => emit("cancel");
</script>
