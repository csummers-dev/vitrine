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
              <span
                v-if="link.mode === 'upload'"
                class="share-card__badge"
                data-testid="share-badge-upload"
              >
                <Icon name="inbox" :size="10" />
                Upload only
              </span>
              <span
                v-if="link.maxDownloads"
                class="share-card__badge"
                :class="{ 'share-card__badge--done': isExhausted(link) }"
              >
                <Icon name="ticket" :size="10" />
                {{
                  isExhausted(link)
                    ? "Used up"
                    : link.maxDownloads === 1
                      ? "One-time"
                      : `${link.maxDownloads} downloads`
                }}
              </span>
            </div>
            <div class="share-card__usage" data-testid="share-usage">
              {{ usageSummary(link, humanTime, filesize) }}
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
        <!-- 4.1: folders can also be shared as a drop-box. Phase 6, 5.5: a
             segmented control; "Upload only" stays visible when the server
             has file requests turned off, disabled, with the reason. -->
        <div v-if="canDropBox" class="share-field">
          <span id="share-kind-label" class="share-field__label"
            >Link type</span
          >
          <UiSegmented
            v-model="mode"
            :options="linkTypes"
            aria-label="Link type"
            size="sm"
            data-testid="share-link-type"
          />
          <div v-if="!uploadSharesEnabled" class="share-field__hint">
            Upload only: turned off on this server.
            <router-link
              v-if="isAdmin"
              to="/settings/global"
              class="share-link"
              @click="onCancel"
              >Turn on in Global settings</router-link
            >
          </div>
          <div v-else-if="mode === 'upload'" class="share-field__hint">
            People with the link can add files to this folder but can't see or
            download what's in it.
          </div>
        </div>
        <template v-if="mode === 'upload'">
          <div class="share-field">
            <label class="share-field__label" for="share-max-file">
              Largest file
            </label>
            <select
              id="share-max-file"
              v-model.number="maxFileSize"
              class="share-input share-input--select"
            >
              <option :value="0">No limit</option>
              <option :value="100 * MB">100 MB</option>
              <option :value="GB">1 GB</option>
              <option :value="10 * GB">10 GB</option>
            </select>
          </div>
          <div class="share-field">
            <label class="share-field__label" for="share-max-total">
              Total for this link
            </label>
            <select
              id="share-max-total"
              v-model.number="maxTotalSize"
              class="share-input share-input--select"
            >
              <option :value="0">No limit</option>
              <option :value="GB">1 GB</option>
              <option :value="10 * GB">10 GB</option>
              <option :value="50 * GB">50 GB</option>
            </select>
          </div>
          <div class="share-field">
            <label class="share-field__label" for="share-exts">
              Allowed file types
              <span class="share-field__label-hint">(optional)</span>
            </label>
            <input
              id="share-exts"
              v-model.trim="allowedExts"
              type="text"
              class="share-input"
              placeholder="e.g. jpg, png, pdf"
            />
          </div>
          <label class="share-check">
            <input v-model="perUploaderFolder" type="checkbox" />
            <span>Put each person's files in a folder named after them</span>
          </label>
        </template>
        <div v-if="mode !== 'upload'" class="share-field">
          <label class="share-field__label" for="share-limit">
            Download limit
          </label>
          <select
            id="share-limit"
            v-model.number="maxDownloads"
            class="share-input share-input--select"
          >
            <option :value="0">Unlimited</option>
            <option :value="1">One-time link</option>
            <option :value="5">5 downloads</option>
            <option :value="10">10 downloads</option>
            <option :value="25">25 downloads</option>
          </select>
          <div class="share-field__hint">
            The link stops working once it has been downloaded this many times.
            Previews count too.
          </div>
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
      <!-- Copy the item's in-app path to the clipboard. Pushed to the far
           left (margin-right:auto) so it reads as a utility, separate from
           the Close / Create flow on the right. -->
      <button
        type="button"
        class="share-btn share-btn--ghost share-btn--copy-path"
        :disabled="!targetPath"
        :title="copiedPath ? 'Copied!' : 'Copy the file path to the clipboard'"
        @click="copyPath"
      >
        <Icon :name="copiedPath ? 'check' : 'copy'" :size="13" />
        {{ copiedPath ? "Copied" : "Copy path" }}
      </button>
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
import UiSegmented from "@/components/ui/UiSegmented.vue";
import { useServerEvents } from "@/composables/useServerEvents";
import { isExhausted, usageSummary } from "@/api/share";
import { uploadSharesEnabled } from "@/utils/constants";
import { useAuthStore } from "@/stores/auth";
import { filesize } from "@/utils";

// The backend's /api/share endpoint returns an array of shares — the API
// helper in share.ts is typed as `Share` (singular), so we widen here.
type ShareLink = Share & {
  expire: number;
  password_hash?: string;
};

const props = defineProps<{
  open: boolean;
  /** Dual-pane: when the second pane opens Share, it passes its own item here
   *  so the panel doesn't read pane A's fileStore selection. */
  override?: { url: string; name: string; path?: string };
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
}>();

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const route = useRoute();
const fileStore = useFileStore();
const authStore = useAuthStore();

const links = ref<ShareLink[]>([]);
const loading = ref<boolean>(false);
const time = ref<number>(0);
const unit = ref<"seconds" | "minutes" | "hours" | "days">("hours");
const password = ref<string>("");
const maxDownloads = ref<number>(0);
// 4.1 drop-box options.
const MB = 1024 * 1024;
const GB = 1024 * MB;
const mode = ref<"" | "upload">("");
const maxFileSize = ref<number>(0);
const maxTotalSize = ref<number>(0);
const allowedExts = ref<string>("");
const perUploaderFolder = ref<boolean>(false);

// 4.2: usage counts update live while the panel is open.
useServerEvents("share.accessed", (u) => {
  const l = links.value.find((x) => x.hash === u.hash);
  if (l) {
    l.views = u.views;
    l.downloads = u.downloads;
    l.lastAccessAt = u.lastAccessAt;
  }
});

const targetUrl = computed<string>(() => {
  if (props.override) return props.override.url;
  // When viewing a file directly, share that file. Otherwise share the
  // single selected item from the current listing.
  if (!fileStore.isListing) return route.path;
  if (fileStore.selectedCount !== 1) return "";
  const item = fileStore.req?.items[fileStore.selected[0]];
  return item?.url ?? "";
});

const targetName = computed<string>(() => {
  if (props.override) return props.override.name;
  if (!fileStore.isListing) return fileStore.req?.name ?? route.path;
  if (fileStore.selectedCount !== 1) return "";
  return fileStore.req?.items[fileStore.selected[0]]?.name ?? "";
});

// The item's decoded in-app path (e.g. "/Documents/foo.txt"), matching the
// "Copy path" affordance in the details pane (InfoPane). Falls back to the
// resource url when no decoded path is available.
const targetPath = computed<string>(() => {
  if (props.override) return props.override.path ?? props.override.url;
  if (!fileStore.isListing)
    return fileStore.req?.path ?? fileStore.req?.url ?? route.path;
  if (fileStore.selectedCount !== 1) return "";
  const item = fileStore.req?.items[fileStore.selected[0]];
  return item?.path ?? item?.url ?? "";
});

// Only folders can receive uploads, and only with create permission. When
// the server has file requests off the choice still shows, disabled.
const canDropBox = computed(
  () => !!authStore.user?.perm.create && targetUrl.value.endsWith("/")
);
const isAdmin = computed(() => !!authStore.user?.perm.admin);
const linkTypes = computed(() => [
  { value: "" as const, label: "Download" },
  {
    value: "upload" as const,
    label: "Upload only",
    disabled: !uploadSharesEnabled,
  },
]);
watch(canDropBox, (ok) => {
  if (!ok || !uploadSharesEnabled) mode.value = "";
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
    const upload =
      mode.value === "upload"
        ? {
            maxFileSize: maxFileSize.value,
            maxTotalSize: maxTotalSize.value,
            allowedExtensions: allowedExts.value ? [allowedExts.value] : [],
            perUploaderFolder: perUploaderFolder.value,
          }
        : undefined;
    const res = (await shareApi.create(
      targetUrl.value,
      password.value,
      time.value ? String(time.value) : "",
      time.value ? unit.value : "hours",
      upload ? 0 : maxDownloads.value,
      upload
    )) as ShareLink;
    links.value.push(res);
    sortLinks();
    time.value = 0;
    unit.value = "hours";
    password.value = "";
    maxDownloads.value = 0;
    mode.value = "";
    maxFileSize.value = 0;
    maxTotalSize.value = 0;
    allowedExts.value = "";
    perUploaderFolder.value = false;
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

// Copy the item's path. Inline "Copied" label (1.5s) + durable toast, mirroring
// the details-pane copy-path UX. Reuses the clipboard util, which falls back to
// execCommand on insecure (HTTP) contexts — important for LAN homelab setups.
const copiedPath = ref<boolean>(false);
let copiedPathTimer: number | null = null;

const copyPath = async () => {
  const path = targetPath.value;
  if (!path) return;
  const flash = () => {
    copiedPath.value = true;
    if (copiedPathTimer !== null) window.clearTimeout(copiedPathTimer);
    copiedPathTimer = window.setTimeout(() => {
      copiedPath.value = false;
      copiedPathTimer = null;
    }, 1500);
    $showSuccess(`Path copied: ${path}`);
  };
  try {
    await copyToClip({ text: path });
    flash();
  } catch {
    try {
      await copyToClip({ text: path }, { permission: true });
      flash();
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
  color: var(--color-ink-3);
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
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
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
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--color-ink-1);
  outline: none;
}

.share-card__link:focus {
  border-color: var(--color-accent);
  box-shadow: var(--focus-halo);
}

.share-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink-2);
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
  background: var(--color-elevated);
  color: var(--color-ink-1);
}

.share-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.share-icon-btn--danger:hover:not(:disabled) {
  background: var(--status-danger-soft);
  color: var(--status-danger);
  border-color: var(--status-danger-ring);
}

.share-card__meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--color-ink-3);
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
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  color: var(--color-ink-2);
  font-weight: 500;
}

.share-card__badge--done {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}
.share-kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.share-kind,
.share-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-ink-1);
}
.share-check {
  margin-bottom: 14px;
}
.share-card__usage {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}

/* Create form */
.share-field {
  margin-bottom: 12px;
}

.share-field__label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-ink-1);
  margin-bottom: 6px;
}

.share-field__label-hint {
  font-weight: 400;
  color: var(--color-ink-3);
  margin-left: 4px;
}

.share-field__expire {
  display: flex;
  gap: 6px;
}

.share-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-ink-3);
}

.share-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-1);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
  width: 100%;
}

.share-input:focus {
  border-color: var(--color-accent);
  box-shadow: var(--focus-halo);
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
  color: var(--color-ink-3);
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
  border-radius: var(--radius-sm);
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
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 1px;
}

.share-btn--ghost {
  background: var(--color-surface);
  border-color: var(--color-line);
  color: var(--color-ink-2);
}

.share-btn--ghost:hover {
  background: var(--color-elevated);
  color: var(--color-ink-1);
}

.share-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
}

.share-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong);
}

.share-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Copy-path utility sits at the far left, away from the Close/Create flow. */
.share-btn--copy-path {
  margin-right: auto;
}
.share-link {
  color: var(--color-accent-ink);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
