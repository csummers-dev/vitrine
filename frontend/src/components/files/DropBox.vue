<template>
  <section class="dropbox" data-testid="dropbox">
    <div class="dropbox__card">
      <div class="dropbox__icon">
        <Icon name="inbox" :size="20" :stroke-width="1.6" />
      </div>
      <div class="dropbox__eyebrow">File request</div>
      <h1 class="dropbox__title">Send files to “{{ info.name }}”</h1>
      <p class="dropbox__hint">
        You can add files here, but you can't see what's already in the folder.
      </p>

      <ul v-if="limits.length" class="dropbox__limits">
        <li v-for="l in limits" :key="l">{{ l }}</li>
      </ul>

      <label class="dropbox__field">
        <span>Your name{{ info.perUploaderFolder ? "" : " (optional)" }}</span>
        <input
          v-model.trim="uploader"
          type="text"
          maxlength="64"
          autocomplete="name"
          class="dropbox__input"
          :placeholder="
            info.perUploaderFolder
              ? 'Your files go in a folder with this name'
              : 'So they know who sent it'
          "
        />
      </label>

      <div
        class="dropbox__zone"
        :class="{ 'dropbox__zone--over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <Icon name="upload" :size="22" :stroke-width="1.5" />
        <span>Drop files here or</span>
        <button type="button" class="dropbox__pick" @click="picker?.click()">
          choose files
        </button>
        <input
          ref="picker"
          type="file"
          multiple
          class="dropbox__file-input"
          data-testid="dropbox-input"
          :accept="info.allowedExtensions?.join(',')"
          @change="onPick"
        />
      </div>

      <ul v-if="items.length" class="dropbox__list" aria-live="polite">
        <li
          v-for="it in items"
          :key="it.id"
          class="dropbox__item"
          :class="`dropbox__item--${it.state}`"
        >
          <div class="dropbox__item-row">
            <span class="dropbox__item-name truncate" :title="it.file.name">{{
              it.storedAs || it.file.name
            }}</span>
            <span class="dropbox__item-size">{{ filesize(it.file.size) }}</span>
            <span class="dropbox__item-state" data-testid="dropbox-state">{{
              stateLabel(it)
            }}</span>
          </div>
          <div v-if="it.state === 'uploading'" class="dropbox__bar">
            <span :style="{ width: `${Math.round(it.progress * 100)}%` }" />
          </div>
          <div v-if="it.error" class="dropbox__error">{{ it.error }}</div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Icon from "@/components/Icon.vue";
import { filesize } from "@/utils";
import { uploadToDropBox, type DropBoxInfo } from "@/api/pub";

const props = defineProps<{ info: DropBoxInfo; password?: string }>();

interface Item {
  id: number;
  file: File;
  state: "queued" | "uploading" | "done" | "failed";
  progress: number;
  storedAs?: string;
  error?: string;
}

const items = ref<Item[]>([]);
const uploader = ref("");
const dragOver = ref(false);
const picker = ref<HTMLInputElement | null>(null);
let nextId = 1;
let running = 0;
const CONCURRENCY = 2;

const limits = computed(() => {
  const out: string[] = [];
  if (props.info.maxFileSize)
    out.push(`Up to ${filesize(props.info.maxFileSize)} per file`);
  if (props.info.remainingBytes !== undefined)
    out.push(`${filesize(props.info.remainingBytes)} of space left`);
  if (props.info.allowedExtensions?.length)
    out.push(`Accepted: ${props.info.allowedExtensions.join(", ")}`);
  return out;
});

const stateLabel = (it: Item) =>
  ({
    queued: "Waiting",
    uploading: `${Math.round(it.progress * 100)}%`,
    done: "Sent",
    failed: "Failed",
  })[it.state];

// Checks that can be done before sending, mirroring the server's.
function precheck(f: File): string | undefined {
  const ext = f.name.includes(".")
    ? "." + f.name.split(".").pop()!.toLowerCase()
    : "";
  const allowed = props.info.allowedExtensions;
  if (allowed?.length && !allowed.includes(ext))
    return "This type of file isn't accepted here.";
  if (props.info.maxFileSize && f.size > props.info.maxFileSize)
    return "The file is larger than this link allows.";
  return undefined;
}

function add(files: FileList | File[] | null) {
  for (const file of Array.from(files ?? [])) {
    const err = precheck(file);
    items.value.push(
      reactive<Item>({
        id: nextId++,
        file,
        state: err ? "failed" : "queued",
        progress: 0,
        error: err,
      })
    );
  }
  pump();
}

function pump() {
  while (running < CONCURRENCY) {
    const it = items.value.find((i) => i.state === "queued");
    if (!it) return;
    running++;
    it.state = "uploading";
    uploadToDropBox(props.info, it.file, {
      uploader: uploader.value,
      password: props.password,
      onProgress: (f) => (it.progress = f),
    })
      .then((name) => {
        it.state = "done";
        it.storedAs = name;
      })
      .catch((e: Error) => {
        it.state = "failed";
        it.error = e.message;
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}

const onPick = (e: Event) => {
  const input = e.target as HTMLInputElement;
  add(input.files);
  input.value = "";
};

const onDrop = (e: DragEvent) => {
  dragOver.value = false;
  add(e.dataTransfer?.files ?? null);
};
</script>

<style scoped>
.dropbox {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 32px 16px;
}
.dropbox__card {
  width: min(560px, 100%);
  padding: 28px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  box-shadow: var(--shadow-2);
}
.dropbox__icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}
.dropbox__eyebrow {
  margin-top: 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3);
}
.dropbox__title {
  margin: 4px 0 6px;
  font-size: 20px;
  font-weight: 650;
  color: var(--color-ink-1);
  overflow-wrap: anywhere;
}
.dropbox__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--color-ink-2);
}
.dropbox__limits {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dropbox__limits li {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  font-size: 11px;
  color: var(--color-ink-2);
}
.dropbox__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-2);
}
.dropbox__input {
  height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink-1);
  font: inherit;
  font-weight: 400;
}
.dropbox__zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  border: 1.5px dashed var(--color-line-strong);
  border-radius: var(--radius-lg);
  color: var(--color-ink-2);
  font-size: 13px;
  text-align: center;
}
.dropbox__zone--over {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.dropbox__pick {
  border: 0;
  background: none;
  padding: 0;
  color: var(--color-accent-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
.dropbox__file-input {
  display: none;
}
.dropbox__list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dropbox__item {
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  font-size: 12px;
}
.dropbox__item-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dropbox__item-name {
  flex: 1;
  min-width: 0;
  color: var(--color-ink-1);
}
.dropbox__item-size,
.dropbox__item-state {
  color: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}
.dropbox__item--done .dropbox__item-state {
  color: var(--c-green);
  font-weight: 600;
}
.dropbox__item--failed .dropbox__item-state,
.dropbox__error {
  color: var(--status-danger);
}
.dropbox__error {
  margin-top: 4px;
}
.dropbox__bar {
  margin-top: 6px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-line);
  overflow: hidden;
}
.dropbox__bar span {
  display: block;
  height: 100%;
  background: var(--color-accent);
  transition: width 0.15s ease;
}
</style>
