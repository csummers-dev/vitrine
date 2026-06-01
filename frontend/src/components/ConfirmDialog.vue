<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div
        v-if="open"
        class="confirm-dialog__scrim"
        @click.self="onCancel"
        @keydown.esc.stop="onCancel"
        @keydown.enter.prevent.stop="onConfirm"
      >
        <div
          class="confirm-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${dialogId}-title`"
          @click.stop
        >
          <div class="confirm-dialog__body">
            <div
              class="confirm-dialog__icon"
              :class="destructive ? 'is-danger' : 'is-info'"
            >
              <Icon
                :name="destructive ? 'triangle-alert' : 'info'"
                :size="18"
                :stroke-width="1.6"
              />
            </div>
            <div class="confirm-dialog__text">
              <h2 :id="`${dialogId}-title`" class="confirm-dialog__title">
                {{ title }}
              </h2>
              <p v-if="message" class="confirm-dialog__message">
                {{ message }}
              </p>
            </div>
          </div>
          <div class="confirm-dialog__actions">
            <button
              ref="cancelBtn"
              type="button"
              class="confirm-dialog__btn confirm-dialog__btn--ghost"
              @click="onCancel"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="confirm-dialog__btn"
              :class="
                destructive
                  ? 'confirm-dialog__btn--danger'
                  : 'confirm-dialog__btn--primary'
              "
              @click="onConfirm"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";

const props = withDefaults(
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

const cancelBtn = ref<HTMLButtonElement | null>(null);
const dialogId = computed(() => `cd-${Math.random().toString(36).slice(2, 9)}`);

// Cancel-by-default focus (safer for destructive dialogs). Esc also cancels.
watch(
  () => props.open,
  async (val) => {
    if (!val) return;
    await nextTick();
    cancelBtn.value?.focus();
  }
);

const onConfirm = () => emit("confirm");
const onCancel = () => emit("cancel");
</script>

<style scoped>
.confirm-dialog__scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 18vh 16px 16px;
  z-index: 1000;
}

.confirm-dialog {
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

.confirm-dialog__body {
  display: flex;
  gap: 14px;
  padding: 18px 18px 16px;
}

.confirm-dialog__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.confirm-dialog__icon.is-danger {
  background: #fef2f2;
  color: #dc2626;
}

.confirm-dialog__icon.is-info {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
}

.confirm-dialog__text {
  flex: 1;
  min-width: 0;
}

.confirm-dialog__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  margin: 0;
  letter-spacing: -0.005em;
}

.confirm-dialog__message {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-ink-2, #52525b);
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

.confirm-dialog__btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.confirm-dialog__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.confirm-dialog__btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.confirm-dialog__btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.confirm-dialog__btn--primary {
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.confirm-dialog__btn--primary:hover {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.confirm-dialog__btn--danger {
  background: #dc2626;
  border-color: #dc2626;
  color: white;
}

.confirm-dialog__btn--danger:hover {
  background: #b91c1c;
  border-color: #b91c1c;
}

/* Transitions */
.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.12s ease;
}
.confirm-enter-active .confirm-dialog,
.confirm-leave-active .confirm-dialog {
  transition:
    transform 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.12s ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
.confirm-enter-from .confirm-dialog,
.confirm-leave-to .confirm-dialog {
  transform: translateY(-6px) scale(0.98);
  opacity: 0;
}
</style>
