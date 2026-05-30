<template>
  <div class="download-prompt" @click.stop>
    <div class="download-prompt__header">
      <h2 class="download-prompt__title">{{ t("prompts.download") }}</h2>
      <p class="download-prompt__message">{{ t("prompts.downloadMessage") }}</p>
    </div>
    <div class="download-prompt__formats">
      <button
        v-for="(ext, format, i) in formats"
        :key="format"
        :id="i === 0 ? 'focus-prompt' : undefined"
        type="button"
        class="download-prompt__format"
        @click="layoutStore.currentPrompt?.confirm(format)"
      >
        <Icon name="package" :size="14" :stroke-width="1.6" />
        <span class="download-prompt__format-label">{{ ext }}</span>
      </button>
    </div>
    <div class="download-prompt__footer">
      <button
        type="button"
        class="download-prompt__cancel"
        @click="layoutStore.closeHovers"
      >
        {{ t("buttons.cancel") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLayoutStore } from "@/stores/layout";
import Icon from "@/components/Icon.vue";

const layoutStore = useLayoutStore();
const { t } = useI18n();

const formats = {
  zip: "zip",
  tar: "tar",
  targz: "tar.gz",
  tarbz2: "tar.bz2",
  tarxz: "tar.xz",
  tarlz4: "tar.lz4",
  tarsz: "tar.sz",
  tarbr: "tar.br",
  tarzst: "tar.zst",
};
</script>

<style scoped>
.download-prompt {
  width: 100%;
  max-width: 440px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  font-family: var(--font-sans, system-ui);
  color: var(--color-ink-1, #18181b);
}

.download-prompt__header {
  padding: 18px 18px 4px;
}

.download-prompt__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.005em;
}

.download-prompt__message {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-ink-2, #52525b);
}

.download-prompt__formats {
  padding: 14px 18px 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.download-prompt__format {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.download-prompt__format:hover {
  border-color: var(--color-accent, #5e6ad2);
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.06));
}

.download-prompt__format:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.download-prompt__format :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
}

.download-prompt__format-label {
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  letter-spacing: 0.02em;
}

.download-prompt__footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

.download-prompt__cancel {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.download-prompt__cancel:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
</style>
