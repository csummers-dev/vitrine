<template>
  <main class="share">
    <header-bar showMenu showLogo>
      <breadcrumbs :base="'/share/' + hash" />
      <template #actions>
        <button
          v-if="fileStore.selectedCount > 0"
          type="button"
          class="share-btn share-btn--primary"
          @click="download"
        >
          <Icon name="download" :size="13" />
          <span>Download</span>
          <span class="share-btn__counter">{{ fileStore.selectedCount }}</span>
        </button>
        <button
          v-if="isSingleFile()"
          type="button"
          class="share-btn share-btn--ghost"
          :title="t('buttons.copyDownloadLinkToClipboard')"
          :aria-label="t('buttons.copyDownloadLinkToClipboard')"
          @click="copyToClipboard(linkSelected())"
        >
          <Icon name="clipboard" :size="13" />
        </button>
        <button
          type="button"
          class="share-btn share-btn--ghost"
          @click="toggleMultipleSelection"
        >
          <Icon
            :name="fileStore.multiple ? 'circle-check' : 'circle'"
            :size="13"
          />
          <span>{{ t("buttons.selectMultiple") }}</span>
        </button>
      </template>
    </header-bar>

    <!-- Loading state -->
    <div v-if="layoutStore.loading" class="share__state">
      <Icon name="loader-circle" :size="14" class="share__spin" />
      <span>{{ t("files.loading") }}</span>
    </div>

    <!-- Password gate (401) -->
    <div v-else-if="error?.status === 401" class="share__gate">
      <div class="share__gate-mesh" aria-hidden="true"></div>
      <form class="share__gate-card" @submit.prevent="fetchData">
        <div class="share__gate-icon">
          <Icon name="lock" :size="18" :stroke-width="1.6" />
        </div>
        <div class="share__gate-eyebrow">Protected share</div>
        <h1 class="share__gate-title">Enter password</h1>
        <p class="share__gate-message">
          This share is password-protected. Ask whoever sent you the link for
          the password.
        </p>
        <input
          v-focus
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="share__gate-input"
          :class="{ 'is-error': attemptedPasswordLogin && password === '' }"
          :placeholder="t('login.password')"
        />
        <p v-if="attemptedPasswordLogin" class="share__gate-error">
          <Icon name="triangle-alert" :size="12" />
          {{ t("login.wrongCredentials") }}
        </p>
        <button
          type="submit"
          class="share-btn share-btn--primary share__gate-submit"
          :disabled="password === ''"
        >
          {{ t("buttons.submit") }}
        </button>
      </form>
    </div>

    <!-- Other errors → reuse the redesigned Errors page -->
    <errors v-else-if="error" :errorCode="error.status" :showHeader="false" />

    <!-- Content -->
    <div v-else-if="req !== null" class="share__body">
      <!-- Info card: file/folder header + actions + QR -->
      <aside class="share__info">
        <div class="share__info-card">
          <div class="share__info-icon" :class="iconColorClass">
            <Icon :name="icon" :size="22" :stroke-width="1.5" />
          </div>
          <div class="share__info-eyebrow">
            {{ req.isDir ? "Shared folder" : "Shared file" }}
          </div>
          <h2 class="share__info-name" :title="req.name">{{ req.name }}</h2>

          <dl class="share__info-meta">
            <div class="share__info-meta-row">
              <dt>{{ req.isDir ? "Items" : "Size" }}</dt>
              <dd>{{ humanSize }}</dd>
            </div>
            <div v-if="!req.isDir" class="share__info-meta-row">
              <dt>Modified</dt>
              <dd :title="modTime">{{ humanTime }}</dd>
            </div>
          </dl>

          <div class="share__info-actions">
            <a
              :href="link"
              target="_blank"
              rel="noopener"
              class="share-btn share-btn--primary share__info-action"
            >
              <Icon name="download" :size="13" />
              <span>{{ t("buttons.download") }}</span>
            </a>
            <a
              v-if="!req.isDir"
              :href="inlineLink"
              target="_blank"
              rel="noopener"
              class="share-btn share-btn--ghost share__info-action"
            >
              <Icon name="external-link" :size="13" />
              <span>{{ t("buttons.openFile") }}</span>
            </a>
          </div>

          <!-- Inline preview when a single file is selected/displayed -->
          <div
            v-if="
              !req.isDir &&
              (req.type === 'image' ||
                req.type === 'video' ||
                req.type === 'audio')
            "
            class="share__info-preview"
          >
            <a
              v-if="req.type === 'image'"
              :href="raw"
              target="_blank"
              rel="noopener"
            >
              <img :src="raw" alt="" />
            </a>
            <video
              v-else-if="req.type === 'video'"
              :src="raw"
              controls
              preload="metadata"
            ></video>
            <audio v-else-if="req.type === 'audio'" :src="raw" controls></audio>
          </div>

          <!-- QR code -->
          <div class="share__info-qr">
            <qrcode-vue
              :value="link"
              :size="140"
              level="M"
              background="transparent"
            />
            <span class="share__info-qr-caption">Scan to open this share</span>
          </div>
        </div>
      </aside>

      <!-- File listing (folders only) -->
      <section v-if="req.isDir" class="share__list">
        <div v-if="req.items.length === 0" class="share__empty">
          <div class="share__empty-icon">
            <Icon name="folder-open" :size="20" :stroke-width="1.4" />
          </div>
          <div class="share__empty-title">{{ t("files.lonely") }}</div>
          <div class="share__empty-hint">
            This folder is empty. Use the download button above to grab the
            folder as a zip.
          </div>
        </div>

        <div v-else>
          <div class="share__list-header">
            <span class="share__list-title">{{ t("files.files") }}</span>
            <span class="share__list-count">{{ req.items.length }}</span>
          </div>

          <div id="listing" class="list file-icons">
            <item
              v-for="item in req.items.slice(0, showLimit)"
              :key="base64(item.name)"
              v-bind:index="item.index"
              v-bind:name="item.name"
              v-bind:isDir="item.isDir"
              v-bind:url="item.url"
              v-bind:modified="item.modified"
              v-bind:type="item.type"
              v-bind:size="item.size"
              readOnly
            />
            <button
              v-if="req.items.length > showLimit"
              type="button"
              class="share__show-more"
              @click="showLimit += 100"
            >
              Show {{ req.items.length - showLimit }} more
            </button>

            <!-- Multi-select pill (only when actively in multi mode) -->
            <div
              :class="{ active: fileStore.multiple }"
              id="multiple-selection"
              class="share__multi-pill"
            >
              <span class="share__multi-label">
                Multiple selection enabled
              </span>
              <div class="share__multi-divider"></div>
              <button
                type="button"
                class="share__multi-close"
                :title="t('buttons.clear')"
                :aria-label="t('buttons.clear')"
                @click="fileStore.multiple = false"
              >
                <Icon name="x" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { pub as api } from "@/api";
import { filesize } from "@/utils";
import dayjs from "dayjs";
import { Base64 } from "js-base64";
import { createURL } from "@/api/utils";
import HeaderBar from "@/components/header/HeaderBar.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import Errors from "@/views/Errors.vue";
import QrcodeVue from "qrcode.vue";
import Item from "@/components/files/ListingItem.vue";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { fileIconColor } from "@/utils/fileIcon";
import { computed, inject, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { StatusError } from "@/api/utils";
import { copy } from "@/utils/clipboard";

const error = ref<StatusError | null>(null);
const showLimit = ref<number>(100);
const password = ref<string>("");
const attemptedPasswordLogin = ref<boolean>(false);
const hash = ref<string>("");
const token = ref<string>("");

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const { t } = useI18n({});

const route = useRoute();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

watch(route, () => {
  showLimit.value = 100;
  fetchData();
});

const req = computed(() => fileStore.req);

const icon = computed(() => {
  if (req.value === null) return "file";
  if (req.value.isDir) return "folder";
  if (req.value.type === "image") return "image";
  if (req.value.type === "audio") return "volume-2";
  if (req.value.type === "video") return "film";
  return "file";
});

const iconColorClass = computed(() =>
  req.value
    ? fileIconColor({
        isDir: req.value.isDir,
        type: req.value.type,
        name: req.value.name,
      })
    : "bg-zinc-100 text-zinc-600"
);

const link = computed(() => (req.value ? api.getDownloadURL(req.value) : ""));
const raw = computed(() => {
  if (!req.value) return "";
  // For single-file shares, the file itself is the resource; for folders,
  // we serve a preview of the currently selected item (legacy behavior).
  if (req.value.isDir) {
    const sel = req.value.items[fileStore.selected[0]];
    if (!sel) return "";
    return createURL(`api/public/dl/${hash.value}${sel.path}`, {
      token: token.value,
    });
  }
  return createURL(`api/public/dl/${hash.value}${req.value.path ?? ""}`, {
    token: token.value,
  });
});
const inlineLink = computed(() =>
  req.value ? api.getDownloadURL(req.value, true) : ""
);
const humanSize = computed(() => {
  if (!req.value) return "";
  return req.value.isDir
    ? `${req.value.items.length} ${req.value.items.length === 1 ? "item" : "items"}`
    : filesize(req.value.size ?? 0);
});
const humanTime = computed(() => dayjs(req.value?.modified).fromNow());
const modTime = computed(() =>
  req.value
    ? new Date(Date.parse(req.value.modified)).toLocaleString()
    : new Date().toLocaleString()
);

const base64 = (name: any) => Base64.encodeURI(name);

const fetchData = async () => {
  fileStore.reload = false;
  fileStore.selected = [];
  fileStore.multiple = false;
  layoutStore.closeHovers();

  layoutStore.loading = true;
  error.value = null;
  if (password.value !== "") {
    attemptedPasswordLogin.value = true;
  }

  let url = route.path;
  if (url === "") url = "/";
  if (url[0] !== "/") url = "/" + url;

  try {
    const file = await api.fetch(url, password.value);
    file.hash = hash.value;
    token.value = file.token || "";
    fileStore.updateRequest(file);
    document.title = `${file.name} - ${document.title}`;
  } catch (err) {
    if (err instanceof Error) error.value = err as StatusError;
  } finally {
    layoutStore.loading = false;
  }
};

const keyEvent = (event: KeyboardEvent) => {
  if (event.key === "Escape" && fileStore.selectedCount > 0) {
    fileStore.selected = [];
  }
};

const toggleMultipleSelection = () => {
  fileStore.toggleMultiple();
};

const isSingleFile = () =>
  fileStore.selectedCount === 1 &&
  !req.value?.items[fileStore.selected[0]].isDir;

const download = () => {
  if (!req.value) return;
  if (isSingleFile()) {
    api.download(
      null,
      hash.value,
      token.value,
      req.value.items[fileStore.selected[0]].path
    );
    return;
  }
  layoutStore.showHover({
    prompt: "download",
    confirm: (format: DownloadFormat) => {
      if (req.value === null) return;
      layoutStore.closeHovers();
      const files: string[] = [];
      for (const i of fileStore.selected) {
        files.push(req.value.items[i].path);
      }
      api.download(format, hash.value, token.value, ...files);
    },
  });
};

const linkSelected = () => {
  return isSingleFile() && req.value
    ? api.getDownloadURL({
        ...req.value,
        hash: hash.value,
        path: req.value.items[fileStore.selected[0]].path,
      })
    : "";
};

const copyToClipboard = async (text: string) => {
  try {
    await copy({ text });
    $showSuccess(t("success.linkCopied"));
  } catch {
    try {
      await copy({ text }, { permission: true });
      $showSuccess(t("success.linkCopied"));
    } catch (e) {
      if (e instanceof Error) $showError(e);
    }
  }
};

onMounted(async () => {
  hash.value = route.params.path[0];
  window.addEventListener("keydown", keyEvent);
  await fetchData();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", keyEvent);
});
</script>

<style scoped>
.share {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-1, #18181b);
  font-family: var(--font-sans, system-ui);
}

/* ── Shared button styles ──────────────────────────────────────────── */
.share-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.share-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
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
  background: var(--accent-gradient);
  border-color: var(--color-accent, #6e72d9);
  color: white;
}

.share-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #575cc7);
}

.share-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.share-btn__counter {
  background: rgba(255, 255, 255, 0.22);
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
}

/* ── State / Loading ───────────────────────────────────────────────── */
.share__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
}

.share__spin {
  animation: share-spin 0.9s linear infinite;
}

@keyframes share-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Password gate ─────────────────────────────────────────────────── */
.share__gate {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  position: relative;
  overflow: hidden;
}

.share__gate-mesh {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(
      ellipse 60% 50% at 20% 25%,
      rgba(110, 114, 217, 0.18) 0%,
      transparent 65%
    ),
    radial-gradient(
      ellipse 60% 50% at 80% 75%,
      rgba(244, 114, 182, 0.14) 0%,
      transparent 65%
    );
}

html.dark .share__gate-mesh {
  background:
    radial-gradient(
      ellipse 60% 50% at 20% 25%,
      rgba(110, 114, 217, 0.32) 0%,
      transparent 65%
    ),
    radial-gradient(
      ellipse 60% 50% at 80% 75%,
      rgba(168, 85, 247, 0.2) 0%,
      transparent 65%
    );
}

.share__gate-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 14px;
  padding: 26px 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  box-shadow:
    0 24px 48px -16px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.02);
}

.share__gate-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.1));
  color: var(--color-accent, #6e72d9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.share__gate-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-3, #a1a1aa);
}

.share__gate-title {
  font-size: 19px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--color-ink-1, #18181b);
}

.share__gate-message {
  margin: 4px 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-ink-2, #52525b);
  max-width: 280px;
}

.share__gate-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  font: inherit;
  font-size: 14px;
  color: var(--color-ink-1, #18181b);
  outline: none;
  text-align: center;
  letter-spacing: 0.1em;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.share__gate-input:focus {
  border-color: var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(110, 114, 217, 0.3));
}

.share__gate-input.is-error {
  border-color: var(--status-danger-fill);
  box-shadow: 0 0 0 3px var(--status-danger-soft);
}

.share__gate-error {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--status-danger);
}

.share__gate-submit {
  width: 100%;
  height: 36px;
  margin-top: 14px;
  font-size: 13.5px;
  font-weight: 600;
}

/* ── Content body ──────────────────────────────────────────────────── */
.share__body {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 24px;
  padding: 24px 32px 40px;
  align-items: start;
}

@media (max-width: 840px) {
  .share__body {
    grid-template-columns: 1fr;
    padding: 20px 16px 32px;
    gap: 16px;
  }
}

/* ── Info card ─────────────────────────────────────────────────────── */
.share__info {
  position: sticky;
  top: 24px;
}

@media (max-width: 840px) {
  .share__info {
    position: static;
  }
}

.share__info-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  padding: 18px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.share__info-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.share__info-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-3, #a1a1aa);
}

.share__info-name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.005em;
  margin: -2px 0 4px;
  color: var(--color-ink-1, #18181b);
  word-break: break-word;
  line-height: 1.25;
}

.share__info-meta {
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}

.share__info-meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.share__info-meta dt {
  color: var(--color-ink-3, #a1a1aa);
  font-weight: 500;
}

.share__info-meta dd {
  margin: 0;
  color: var(--color-ink-1, #18181b);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.share__info-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.share__info-action {
  flex: 1;
  height: 34px;
  justify-content: center;
  font-size: 13px;
}

.share__info-preview {
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-canvas, #fafaf9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
}

.share__info-preview img,
.share__info-preview video {
  width: 100%;
  height: auto;
  max-height: 260px;
  display: block;
}

.share__info-preview audio {
  width: 100%;
  padding: 12px;
}

.share__info-qr {
  margin-top: 6px;
  padding: 14px;
  background: var(--color-canvas, #fafaf9);
  border: 1px dashed var(--color-line, #ececec);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.share__info-qr-caption {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}

.share__info-qr :deep(canvas),
.share__info-qr :deep(svg) {
  border-radius: 4px;
}

/* ── File listing ──────────────────────────────────────────────────── */
.share__list {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  overflow: hidden;
}

.share__list-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--color-line, #ececec);
}

.share__list-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}

.share__list-count {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
}

#listing.list {
  height: auto;
}

.share__show-more {
  width: 100%;
  padding: 12px;
  text-align: center;
  background: var(--color-canvas, #fafaf9);
  border: 0;
  border-top: 1px solid var(--color-line, #ececec);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-accent, #6e72d9);
  cursor: pointer;
}

.share__show-more:hover {
  background: var(--color-elevated, #f4f4f5);
}

/* Multi-select pill (only shows when fileStore.multiple is on) */
.share__multi-pill {
  position: fixed;
  bottom: 1.25em;
  left: 50%;
  transform: translateX(-50%) translateY(120%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border-radius: 999px;
  /* Use inverse-surface so the pill stays dark in both themes */
  background: var(--color-inverse-surface, #18181b);
  color: white;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.3);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 999;
}

.share__multi-pill.active {
  transform: translateX(-50%) translateY(0);
}

.share__multi-label {
  white-space: nowrap;
}

.share__multi-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.18);
}

.share__multi-close {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: transparent;
  border: 0;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.share__multi-close:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* ── Empty state ───────────────────────────────────────────────────── */
.share__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 50px 20px;
  text-align: center;
}

.share__empty-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.share__empty-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}

.share__empty-hint {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  max-width: 320px;
  line-height: 1.45;
}
</style>
