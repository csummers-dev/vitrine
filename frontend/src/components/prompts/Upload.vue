<template>
  <div class="upload-prompt" @click.stop>
    <div class="upload-prompt__header">
      <h2 class="upload-prompt__title">{{ t("prompts.upload") }}</h2>
      <p class="upload-prompt__message">{{ t("prompts.uploadMessage") }}</p>
    </div>
    <div class="upload-prompt__choices">
      <button
        id="focus-prompt"
        type="button"
        class="upload-prompt__choice"
        tabindex="1"
        @click="uploadFile"
        @keydown.enter.prevent="uploadFile"
      >
        <div class="upload-prompt__choice-icon">
          <Icon name="file" :size="22" :stroke-width="1.5" />
        </div>
        <div class="upload-prompt__choice-label">{{ t("buttons.file") }}</div>
        <div class="upload-prompt__choice-hint">
          One or more individual files
        </div>
      </button>
      <button
        type="button"
        class="upload-prompt__choice"
        tabindex="2"
        @click="uploadFolder"
        @keydown.enter.prevent="uploadFolder"
      >
        <div class="upload-prompt__choice-icon">
          <Icon name="folder" :size="22" :stroke-width="1.5" />
        </div>
        <div class="upload-prompt__choice-label">{{ t("buttons.folder") }}</div>
        <div class="upload-prompt__choice-hint">An entire folder tree</div>
      </button>
    </div>
    <div class="upload-prompt__footer">
      <button
        type="button"
        class="upload-prompt__cancel"
        @click="layoutStore.closeHovers"
      >
        {{ t("buttons.cancel") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useLayoutStore } from "@/stores/layout";
import * as upload from "@/utils/upload";

const { t } = useI18n();
const route = useRoute();
const layoutStore = useLayoutStore();

const uploadInput = async (event: Event) => {
  const files = (event.currentTarget as HTMLInputElement)?.files;
  if (files === null) return;

  const folder_upload = !!files[0].webkitRelativePath;

  const uploadFiles: UploadList = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = folder_upload ? file.webkitRelativePath : undefined;
    uploadFiles.push({
      file,
      name: file.name,
      size: file.size,
      isDir: false,
      fullPath,
    });
  }

  const path = route.path.endsWith("/") ? route.path : route.path + "/";
  const conflict = await upload.checkConflict(uploadFiles, path);

  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: { conflict, isUploadAction: true, to: path },
      confirm: (event: Event, result: Array<ConflictingResource>) => {
        event.preventDefault();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const item = result[i];
          if (item.checked.length == 2) {
            continue;
          } else if (item.checked.length == 1 && item.checked[0] == "origin") {
            uploadFiles[item.index].overwrite = true;
          } else {
            uploadFiles.splice(item.index, 1);
          }
        }
        if (uploadFiles.length > 0) {
          upload.handleFiles(uploadFiles, path);
        }
      },
    });
    return;
  }

  upload.handleFiles(uploadFiles, path);
};

const openUpload = (isFolder: boolean) => {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.webkitdirectory = isFolder;
  input.onchange = uploadInput;
  input.click();
};

const uploadFile = () => openUpload(false);
const uploadFolder = () => openUpload(true);
</script>

<style scoped>
.upload-prompt {
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

.upload-prompt__header {
  padding: 18px 18px 4px;
}

.upload-prompt__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.005em;
}

.upload-prompt__message {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-ink-2, #52525b);
}

.upload-prompt__choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 16px 18px 14px;
}

.upload-prompt__choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 14px 16px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  cursor: pointer;
  font: inherit;
  text-align: center;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    transform 0.06s ease;
}

.upload-prompt__choice:hover {
  border-color: var(--color-accent, #5e6ad2);
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.06));
}

.upload-prompt__choice:active {
  transform: translateY(1px);
}

.upload-prompt__choice:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.upload-prompt__choice-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-prompt__choice-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}

.upload-prompt__choice-hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  line-height: 1.4;
}

.upload-prompt__footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

.upload-prompt__cancel {
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

.upload-prompt__cancel:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
</style>
