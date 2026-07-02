<template>
  <div class="text-editor">
    <!-- Toolbar — mirrors the preview shell's bar (close · filename ·
         format toggles · primary action), so editing a file looks like
         the read-only text preview, just writable. -->
    <header class="editor-topbar">
      <div class="editor-topbar__group editor-topbar__group--grow">
        <button
          type="button"
          class="editor-iconbtn"
          :title="t('buttons.close')"
          :aria-label="t('buttons.close')"
          @click="close()"
        >
          <Icon name="x" :size="16" />
        </button>
        <div class="editor-topbar__title">
          <Icon
            name="file-pen-line"
            :size="14"
            class="editor-topbar__title-icon"
          />
          <span class="editor-topbar__name">{{
            fileStore.req?.name ?? ""
          }}</span>
          <span
            v-if="isDirty"
            class="editor-topbar__dirty"
            title="Unsaved changes"
            >•</span
          >
        </div>
      </div>

      <div class="editor-topbar__group">
        <!-- Soft-wrap toggle (matches the preview text tool). Irrelevant
             while showing rendered markdown. -->
        <button
          v-if="!(isMarkdownFile && isPreview)"
          type="button"
          class="editor-iconbtn"
          :class="{ 'editor-iconbtn--active': softWrap }"
          :title="softWrap ? 'Disable soft wrap' : 'Enable soft wrap'"
          :aria-label="softWrap ? 'Disable soft wrap' : 'Enable soft wrap'"
          :aria-pressed="softWrap"
          @click="softWrap = !softWrap"
        >
          <Icon name="wrap-text" :size="16" />
        </button>

        <!-- Rendered / raw markdown toggle (matches the preview text tool). -->
        <button
          v-if="isMarkdownFile"
          type="button"
          class="editor-iconbtn"
          :class="{ 'editor-iconbtn--active': isPreview }"
          :title="isPreview ? 'Show raw source' : 'Show rendered'"
          :aria-label="isPreview ? 'Show raw source' : 'Show rendered'"
          :aria-pressed="isPreview"
          @click="isPreview = !isPreview"
        >
          <Icon :name="isPreview ? 'code' : 'book-open'" :size="16" />
        </button>

        <button
          v-if="canModify"
          type="button"
          class="editor-savebtn"
          :disabled="saving || !isDirty"
          @click="save()"
        >
          <Icon
            :name="justSaved ? 'check' : saving ? 'loader-circle' : 'save'"
            :size="14"
            :class="{ 'editor-spin': saving }"
          />
          <span>{{ justSaved ? "Saved" : t("buttons.save") }}</span>
        </button>
      </div>
    </header>

    <!-- Stage: same calm dot-grid canvas as the preview shell. -->
    <div class="text-editor__stage">
      <!-- Rendered markdown (read-only) — the exact preview component. -->
      <TextViewer
        v-if="isMarkdownFile && isPreview"
        :content="content"
        :soft-wrap="softWrap"
        :is-markdown="true"
        :rendered="true"
      />

      <!-- Editable surface — a textarea styled to match the preview's
           read card (centered, monospace, surface). -->
      <div v-else class="text-editor__card">
        <textarea
          ref="textareaEl"
          v-model="content"
          class="text-editor__area"
          :class="{ 'text-editor__area--wrap': softWrap }"
          :wrap="softWrap ? 'soft' : 'off'"
          :readonly="isReadOnly"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          :aria-label="`Editing ${fileStore.req?.name ?? 'file'}`"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import TextViewer from "@/components/files/TextViewer.vue";
import { files as api } from "@/api";
import url from "@/utils/url";
import { useStorage } from "@vueuse/core";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";

const $showError = inject<IToastError>("$showError")!;

const fileStore = useFileStore();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

// ── State ───────────────────────────────────────────────────────────
// `content` is the live edit buffer; `original` is the last-saved value,
// so dirtiness is a plain comparison (no Ace undo-manager needed).
const content = ref<string>(fileStore.req?.content ?? "");
const original = ref<string>(content.value);
const isDirty = computed(() => content.value !== original.value);

const isMarkdownFile = computed(() => {
  const n = fileStore.req?.name?.toLowerCase() ?? "";
  return n.endsWith(".md") || n.endsWith(".markdown");
});
const isReadOnly = computed(() => fileStore.req?.type === "textImmutable");
const canModify = computed(
  () => !!authStore.user?.perm.modify && !isReadOnly.value
);

// Rendered-markdown toggle + soft-wrap, persisted like the preview tool.
const isPreview = ref<boolean>(false);
const softWrap = useStorage<boolean>("editor-soft-wrap", true);

const textareaEl = ref<HTMLTextAreaElement | null>(null);

// Save feedback: spinner while in flight, a brief check on success.
const saving = ref(false);
const justSaved = ref(false);
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const save = async (throwError?: boolean) => {
  if (saving.value || !canModify.value) return;
  saving.value = true;
  justSaved.value = false;
  try {
    await api.put(route.path, content.value);
    original.value = content.value; // now clean
    justSaved.value = true;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (justSaved.value = false), 1400);
  } catch (e: any) {
    $showError(e);
    if (throwError) throw e;
  } finally {
    saving.value = false;
  }
};

const finishClose = () => {
  router.push({ path: url.removeLastDir(route.path) + "/" });
};

const close = () => {
  if (!isDirty.value) {
    finishClose();
    return;
  }
  layoutStore.showHover({
    prompt: "discardEditorChanges",
    // V3-F: the DiscardEditorChanges "Discard" button calls confirm() with no
    // event, so dereferencing it unguarded threw a TypeError *before* the close
    // ran — the editor stayed open (Save/Cancel worked because they touch no
    // event). Guard the optional event so Discard closes reliably.
    confirm: (event?: Event) => {
      event?.preventDefault();
      original.value = content.value; // mark clean so beforeunload won't fire
      finishClose();
    },
    saveAction: async () => {
      try {
        await save(true);
        finishClose();
      } catch {
        /* save failed — stay open, error already toasted */
      }
    },
  });
};

// ── Keyboard: Esc closes, Cmd/Ctrl+S saves ──────────────────────────
const keyEvent = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    close();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    void save();
  }
};

const handlePageChange = (event: BeforeUnloadEvent) => {
  if (isDirty.value) {
    event.preventDefault();
    event.returnValue = true;
  }
};

// Block in-app navigation away with unsaved changes (discard / save prompt).
onBeforeRouteUpdate(async () => {
  if (!isDirty.value) return; // proceed
  return new Promise<boolean | undefined>((resolve) => {
    layoutStore.showHover({
      prompt: "discardEditorChanges",
      confirm: (event: Event) => {
        event.preventDefault();
        original.value = content.value;
        resolve(undefined); // proceed (discard)
      },
      saveAction: async () => {
        await save();
        resolve(undefined); // proceed (save)
      },
    });
  });
});

onMounted(() => {
  window.addEventListener("keydown", keyEvent);
  window.addEventListener("beforeunload", handlePageChange);
  // Focus the edit surface so typing works immediately (skip for the
  // read-only rendered view / immutable files).
  if (!isReadOnly.value) {
    void nextTick(() => textareaEl.value?.focus());
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", keyEvent);
  window.removeEventListener("beforeunload", handlePageChange);
  if (savedTimer) clearTimeout(savedTimer);
});
</script>

<style scoped>
/* Full-screen shell on the app's canvas — same footprint the preview uses. */
.text-editor {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  background: var(--color-canvas, #fafaf9);
  overflow: hidden;
}

/* ── Toolbar (mirrors the preview bar) ───────────────────────────────── */
.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  padding: 0 12px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-line, #ececec);
  flex-shrink: 0;
}
.editor-topbar__group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.editor-topbar__group--grow {
  flex: 1;
}
.editor-topbar__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin-left: 2px;
}
.editor-topbar__title-icon {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}
.editor-topbar__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editor-topbar__dirty {
  color: var(--color-accent, #6e72d9);
  font-size: 20px;
  line-height: 0;
  flex-shrink: 0;
}

.editor-iconbtn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: transparent;
  border: 0;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.editor-iconbtn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.editor-iconbtn--active {
  background: var(--color-selected, rgba(110, 114, 217, 0.12));
  color: var(--color-accent, #6e72d9);
}
.editor-iconbtn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

.editor-savebtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 7px;
  border: 0;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    opacity var(--dur-base) ease;
}
.editor-savebtn:hover:not(:disabled) {
  background: var(--color-accent-strong, #4e5ac0);
}
.editor-savebtn:disabled {
  opacity: 0.55;
  cursor: default;
}
.editor-savebtn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

.editor-spin {
  animation: editor-spin 0.9s linear infinite;
}
@keyframes editor-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .editor-spin {
    animation: none;
  }
}

/* ── Stage + card (mirrors TextViewer's calm read surface) ───────────── */
.text-editor__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 24px 16px;
  overflow: auto;
  background-color: var(--color-canvas, #fafaf9);
  background-image: radial-gradient(
    rgba(24, 24, 27, 0.05) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
}
html.dark .text-editor__stage {
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px
  );
}

.text-editor__card {
  width: min(960px, 100%);
  height: 100%;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.text-editor__area {
  flex: 1;
  width: 100%;
  margin: 0;
  padding: 18px 22px;
  border: 0;
  outline: none;
  resize: none;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}
.text-editor__area--wrap {
  white-space: pre-wrap;
  word-break: break-word;
}
.text-editor__area::placeholder {
  color: var(--color-ink-3, #a1a1aa);
}
</style>
