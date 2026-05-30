<template>
  <SlideOver :open="open" eyebrow="Share" :title="title" @cancel="onCancel">
    <!-- Existing shares -->
    <section v-if="loading" class="share-state">
      <Icon name="loader-circle" :size="14" class="share-spin" />
      <span>Loading shares…</span>
    </section>

    <template v-else>
      <section v-if="links.length > 0" class="share-section">
        <div class="share-section__title">
          Active links ({{ links.length }})
        </div>
        <ul class="share-list">
          <li v-for="link in links" :key="link.hash" class="share-card">
            <div class="share-card__row">
              <input
                readonly
                type="text"
                class="share-card__link"
                :value="buildLink(link)"
                @focus="(e) => (e.target as HTMLInputElement).select()"
              />
              <button
                type="button"
                class="share-icon-btn"
                :title="'Copy link'"
                aria-label="Copy link"
                @click="copyToClipboard(buildLink(link))"
              >
                <Icon name="clipboard" :size="13" />
              </button>
              <button
                type="button"
                class="share-icon-btn"
                :title="'Copy direct download link'"
                aria-label="Copy direct download link"
                :disabled="!!link.password_hash"
                @click="copyToClipboard(buildDownloadLink(link))"
              >
                <Icon name="download" :size="13" />
              </button>
              <button
                type="button"
                class="share-icon-btn share-icon-btn--danger"
                :title="'Revoke'"
                aria-label="Revoke"
                @click="onDeleteLink(link)"
              >
                <Icon name="trash-2" :size="13" />
              </button>
            </div>
            <div class="share-card__meta">
              <span class="share-card__expires">
                <Icon name="clock-3" :size="11" />
                <span v-if="link.expire !== 0">
                  Expires {{ humanTime(link.expire) }}
                </span>
                <span v-else>Never expires</span>
              </span>
              <span v-if="link.password_hash" class="share-card__badge">
                <Icon name="lock" :size="10" />
                Password
              </span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Create new -->
      <section class="share-section">
        <div class="share-section__title">
          {{ links.length === 0 ? "Create a share link" : "Add another link" }}
        </div>
        <div class="share-field">
          <label class="share-field__label">Expires after</label>
          <div class="share-field__expire">
            <input
              v-model.number="time"
              type="number"
              min="0"
              max="2147483647"
              class="share-input share-input--num"
              @keyup.enter="onCreate"
            />
            <select v-model="unit" class="share-input share-input--select">
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
          <div class="share-field__hint">Leave 0 for a permanent link.</div>
        </div>
        <div class="share-field">
          <label class="share-field__label">
            Password
            <span class="share-field__label-hint">(optional)</span>
          </label>
          <input
            v-model.trim="password"
            type="password"
            placeholder="Leave blank for no password"
            class="share-input"
            @keyup.enter="onCreate"
          />
        </div>
      </section>
    </template>

    <template #footer>
      <button
        type="button"
        class="share-btn share-btn--ghost"
        @click="onCancel"
      >
        Close
      </button>
      <button
        type="button"
        class="share-btn share-btn--primary"
        :disabled="loading"
        @click="onCreate"
      >
        <Icon name="link" :size="13" />
        Create link
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useFileStore } from "@/stores/file";
import { share as shareApi, pub } from "@/api";
import { copy as copyToClip } from "@/utils/clipboard";
import dayjs from "dayjs";
import SlideOver from "@/components/SlideOver.vue";
import Icon from "@/components/Icon.vue";

// The backend's /api/share endpoint returns an array of shares — the API
// helper in share.ts is typed as `Share` (singular), so we widen here.
type ShareLink = Share & {
  expire: number;
  password_hash?: string;
};

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
}>();

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const route = useRoute();
const fileStore = useFileStore();

const links = ref<ShareLink[]>([]);
const loading = ref<boolean>(false);
const time = ref<number>(0);
const unit = ref<"seconds" | "minutes" | "hours" | "days">("hours");
const password = ref<string>("");

const targetUrl = computed<string>(() => {
  // When viewing a file directly, share that file. Otherwise share the
  // single selected item from the current listing.
  if (!fileStore.isListing) return route.path;
  if (fileStore.selectedCount !== 1) return "";
  const item = fileStore.req?.items[fileStore.selected[0]];
  return item?.url ?? "";
});

const targetName = computed<string>(() => {
  if (!fileStore.isListing) return fileStore.req?.name ?? route.path;
  if (fileStore.selectedCount !== 1) return "";
  return fileStore.req?.items[fileStore.selected[0]]?.name ?? "";
});

const title = computed(() =>
  targetName.value ? `Share “${targetName.value}”` : "Share"
);

const sortLinks = () => {
  links.value.sort((a, b) => {
    if (a.expire === 0) return -1;
    if (b.expire === 0) return 1;
    return a.expire - b.expire;
  });
};

const loadLinks = async () => {
  if (!targetUrl.value) {
    links.value = [];
    return;
  }
  loading.value = true;
  try {
    const result = (await shareApi.get(targetUrl.value)) as unknown as
      | ShareLink[]
      | null;
    links.value = result ?? [];
    sortLinks();
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    loading.value = false;
  }
};

const onCreate = async () => {
  if (!targetUrl.value) return;
  try {
    const res = (await (time.value
      ? shareApi.create(
          targetUrl.value,
          password.value,
          String(time.value),
          unit.value
        )
      : shareApi.create(targetUrl.value, password.value))) as ShareLink;
    links.value.push(res);
    sortLinks();
    time.value = 0;
    unit.value = "hours";
    password.value = "";
    $showSuccess("Share link created");
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
};

const onDeleteLink = async (link: ShareLink) => {
  try {
    await shareApi.remove(link.hash);
    links.value = links.value.filter((l) => l.hash !== link.hash);
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await copyToClip({ text });
    $showSuccess("Link copied to clipboard");
  } catch {
    try {
      await copyToClip({ text }, { permission: true });
      $showSuccess("Link copied to clipboard");
    } catch (e) {
      if (e instanceof Error) $showError(e);
    }
  }
};

const humanTime = (epochSeconds: number) =>
  dayjs(epochSeconds * 1000).fromNow();

const buildLink = (link: ShareLink) => shareApi.getShareURL(link);
const buildDownloadLink = (link: ShareLink) =>
  // getDownloadURL's typing wants a full Resource, but at runtime only `hash`
  // and `path` are read off it. Cast so we don't need to construct an
  // entirely unused listing payload just to satisfy the compiler.
  pub.getDownloadURL(
    { hash: link.hash, path: "" } as unknown as Resource,
    true
  );

const onCancel = () => emit("cancel");

// Refresh when the panel opens or when the target URL changes while open.
watch(
  () => [props.open, targetUrl.value],
  ([nowOpen]) => {
    if (!nowOpen) return;
    void loadLinks();
  },
  { immediate: false }
);
</script>

<style scoped>
.share-section {
  margin-bottom: 18px;
}

.share-section:last-child {
  margin-bottom: 0;
}

.share-section__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-bottom: 8px;
}

/* Existing-share list */
.share-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-card {
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  padding: 10px;
}

.share-card__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.share-card__link {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-canvas, #fafaf9);
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--color-ink-1, #18181b);
  outline: none;
}

.share-card__link:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}

.share-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.1s ease,
    color 0.1s ease,
    border-color 0.1s ease;
}

.share-icon-btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.share-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.share-icon-btn--danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #dc2626;
  border-color: #fecaca;
}

.share-card__meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}

.share-card__expires {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.share-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
  font-weight: 500;
}

/* Create form */
.share-field {
  margin-bottom: 12px;
}

.share-field__label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  margin-bottom: 6px;
}

.share-field__label-hint {
  font-weight: 400;
  color: var(--color-ink-3, #a1a1aa);
  margin-left: 4px;
}

.share-field__expire {
  display: flex;
  gap: 6px;
}

.share-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}

.share-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
  width: 100%;
}

.share-input:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}

.share-input--num {
  width: 100px;
  flex-shrink: 0;
}

.share-input--select {
  flex: 1;
  cursor: pointer;
}

/* States */
.share-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
}

.share-spin {
  animation: share-spin 0.9s linear infinite;
}

@keyframes share-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Footer buttons */
.share-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.share-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.share-btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.share-btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.share-btn--primary {
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.share-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.share-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
