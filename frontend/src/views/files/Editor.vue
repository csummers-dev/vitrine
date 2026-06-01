<template>
  <div id="editor-container">
    <!-- RC-36: purpose-built editor toolbar matching the app's design
         system (replaces the legacy <header-bar>/<action> chrome + the
         broken native <title> element that rendered the filename invisible). -->
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
        </div>
      </div>

      <div class="editor-topbar__group">
        <div class="editor-fontsize" role="group" aria-label="Font size">
          <button
            type="button"
            class="editor-iconbtn editor-iconbtn--sm"
            :title="t('buttons.decreaseFontSize')"
            :aria-label="t('buttons.decreaseFontSize')"
            @click="decreaseFontSize"
          >
            <Icon name="minus" :size="15" />
          </button>
          <span class="editor-fontsize__val">{{ fontSize }}px</span>
          <button
            type="button"
            class="editor-iconbtn editor-iconbtn--sm"
            :title="t('buttons.increaseFontSize')"
            :aria-label="t('buttons.increaseFontSize')"
            @click="increaseFontSize"
          >
            <Icon name="plus" :size="15" />
          </button>
        </div>

        <button
          v-show="isMarkdownFile"
          type="button"
          class="editor-iconbtn"
          :class="{ 'editor-iconbtn--active': isPreview }"
          :title="t('buttons.preview')"
          :aria-label="t('buttons.preview')"
          @click="preview()"
        >
          <Icon name="eye" :size="16" />
        </button>

        <button
          v-if="authStore.user?.perm.modify"
          type="button"
          class="editor-savebtn"
          :disabled="saving"
          @click="save()"
        >
          <Icon
            :name="justSaved ? 'check' : saving ? 'loader-circle' : 'save'"
            :size="14"
            :class="{ 'editor-spin': saving }"
          />
          <span>{{ t("buttons.save") }}</span>
        </button>
      </div>
    </header>

    <!-- preview container -->
    <div class="editor-loading delayed" v-if="layoutStore.loading">
      <Icon name="loader-circle" :size="20" class="editor-spin" />
    </div>
    <template v-else>
      <div class="editor-header">
        <div class="editor-header__crumbs">
          <Breadcrumbs base="/files" noLink />
        </div>

        <div class="editor-header__tools">
          <button
            type="button"
            class="editor-tool"
            :disabled="isSelectionEmpty"
            :title="t('buttons.copy', { defaultMessage: 'Copy' })"
            :aria-label="t('buttons.copy', { defaultMessage: 'Copy' })"
            @click="executeEditorCommand('copy')"
          >
            <Icon name="copy" :size="14" />
          </button>
          <button
            type="button"
            class="editor-tool"
            :disabled="isSelectionEmpty"
            title="Cut"
            aria-label="Cut"
            @click="executeEditorCommand('cut')"
          >
            <Icon name="scissors" :size="14" />
          </button>
          <button
            type="button"
            class="editor-tool"
            title="Paste"
            aria-label="Paste"
            @click="executeEditorCommand('paste')"
          >
            <Icon name="clipboard" :size="14" />
          </button>
          <button
            type="button"
            class="editor-tool"
            title="Command palette"
            aria-label="Open editor command palette"
            @click="executeEditorCommand('openCommandPalette')"
          >
            <Icon name="ellipsis-vertical" :size="14" />
          </button>
        </div>
      </div>

      <div
        v-show="isPreview && isMarkdownFile"
        id="preview-container"
        class="md_preview"
        v-html="previewContent"
      ></div>
      <form v-show="!isPreview || !isMarkdownFile" id="editor"></form>
    </template>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { files as api } from "@/api";
import url from "@/utils/url";
import ace, { Ace, version as ace_version } from "ace-builds";
import "ace-builds/src-noconflict/ext-language_tools";
import modelist from "ace-builds/src-noconflict/ext-modelist";
import DOMPurify from "dompurify";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { getEditorTheme } from "@/utils/theme";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import { inject, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import { read, copy } from "@/utils/clipboard";

const $showError = inject<IToastError>("$showError")!;

const fileStore = useFileStore();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();

const { t } = useI18n();

const route = useRoute();
const router = useRouter();

const editor = ref<Ace.Editor | null>(null);
const fontSize = ref(parseInt(localStorage.getItem("editorFontSize") || "14"));

const isPreview = ref(false);
const previewContent = ref("");
const isMarkdownFile =
  fileStore.req?.name.endsWith(".md") ||
  fileStore.req?.name.endsWith(".markdown");
const katexOptions = {
  output: "mathml" as const,
  throwOnError: false,
};
marked.use(markedKatex(katexOptions));

const isSelectionEmpty = ref(true);

// Save feedback (RC-36): the legacy `buttons` util targeted a material-icon
// `<i>` child that no longer exists, so the save spinner was a silent no-op.
// Drive it locally instead — spinner while in flight, a brief check on success.
const saving = ref(false);
const justSaved = ref(false);
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const executeEditorCommand = (name: string) => {
  if (name == "paste") {
    read()
      .then((data) => {
        editor.value?.execCommand("paste", {
          text: data,
        });
      })
      .catch((e) => {
        if (
          document.queryCommandSupported &&
          document.queryCommandSupported("paste")
        ) {
          document.execCommand("paste");
        } else {
          console.warn("the clipboard api is not supported", e);
        }
      });
    return;
  }
  if (name == "copy" || name == "cut") {
    const selectedText = editor.value?.getCopyText();
    copy({ text: selectedText });
  }
  editor.value?.execCommand(name);
};

onMounted(() => {
  window.addEventListener("keydown", keyEvent);
  window.addEventListener("beforeunload", handlePageChange);

  const fileContent = fileStore.req?.content || "";

  watchEffect(async () => {
    if (isMarkdownFile && isPreview.value) {
      const new_value = editor.value?.getValue() || "";
      try {
        previewContent.value = DOMPurify.sanitize(await marked(new_value));
      } catch (error) {
        console.error("Failed to convert content to HTML:", error);
        previewContent.value = "";
      }
    }
  });

  ace.config.set(
    "basePath",
    `https://cdn.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`
  );

  if (!layoutStore.loading) {
    initEditor(fileContent);
  } else {
    const unwatch = watchEffect(() => {
      // Initialize editor when layout is loaded
      if (!layoutStore.loading) {
        setTimeout(() => {
          initEditor(fileContent);
          unwatch();
        }, 50);
      }
    });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", keyEvent);
  window.removeEventListener("beforeunload", handlePageChange);
  if (savedTimer) clearTimeout(savedTimer);
  editor.value?.destroy();
});

// Vue Router 5 return-value navigation guard (G1):
//   return undefined / true → proceed
//   return false            → cancel
//   return a route object   → redirect
// Async guards return a Promise. The discard-changes prompt is async,
// so we wrap it in a Promise that resolves once the user picks Discard
// or Save — preserving the legacy next()-callback behavior of the
// prompt hanging the navigation until a decision is made.
onBeforeRouteUpdate(async () => {
  if (editor.value?.session.getUndoManager().isClean()) {
    return; // proceed
  }

  return new Promise<boolean | undefined>((resolve) => {
    layoutStore.showHover({
      prompt: "discardEditorChanges",
      confirm: (event: Event) => {
        event.preventDefault();
        resolve(undefined); // proceed (discard)
      },
      saveAction: async () => {
        await save();
        resolve(undefined); // proceed (save)
      },
    });
  });
});

const initEditor = (fileContent: string) => {
  editor.value = ace.edit("editor", {
    value: fileContent,
    showPrintMargin: false,
    readOnly: fileStore.req?.type === "textImmutable",
    theme: getEditorTheme(authStore.user?.aceEditorTheme ?? ""),
    mode: modelist.getModeForPath(fileStore.req!.name).mode,
    wrap: true,
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    enableSnippets: true,
  });

  editor.value.setFontSize(fontSize.value);
  editor.value.focus();

  const selection = editor.value?.getSelection();
  selection.on("changeSelection", function () {
    isSelectionEmpty.value = selection.isEmpty();
  });
};

const keyEvent = (event: KeyboardEvent) => {
  if (event.code === "Escape") {
    close();
  }

  if (!event.ctrlKey && !event.metaKey) {
    return;
  }

  if (event.key !== "s") {
    return;
  }

  event.preventDefault();
  save();
};

const handlePageChange = (event: BeforeUnloadEvent) => {
  if (!editor.value?.session.getUndoManager().isClean()) {
    event.preventDefault();
    // returnValue is now depecrated, though keeping in for legacy browser support
    // https://developer.mozilla.org/en-US/docs/Web/API/BeforeUnloadEvent/returnValue
    event.returnValue = true;
  }
};

const save = async (throwError?: boolean) => {
  if (saving.value) return; // guard against double-submit (Ctrl+S spam)
  saving.value = true;
  justSaved.value = false;

  try {
    await api.put(route.path, editor.value?.getValue());
    editor.value?.session.getUndoManager().markClean();
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

const increaseFontSize = () => {
  fontSize.value += 1;
  editor.value?.setFontSize(fontSize.value);
  localStorage.setItem("editorFontSize", fontSize.value.toString());
};

const decreaseFontSize = () => {
  if (fontSize.value > 1) {
    fontSize.value -= 1;
    editor.value?.setFontSize(fontSize.value);
    localStorage.setItem("editorFontSize", fontSize.value.toString());
  }
};

const close = () => {
  if (!editor.value?.session.getUndoManager().isClean()) {
    layoutStore.showHover({
      prompt: "discardEditorChanges",
      confirm: (event: Event) => {
        event.preventDefault();
        editor.value?.session.getUndoManager().reset();
        finishClose();
      },
      saveAction: async () => {
        try {
          await save(true);
          finishClose();
        } catch {}
      },
    });
    return;
  }
  finishClose();
};

const finishClose = () => {
  const uri = url.removeLastDir(route.path) + "/";
  router.push({ path: uri });
};

const preview = () => {
  isPreview.value = !isPreview.value;
};
</script>

<style scoped>
/* ── Loading spinner (Stage 11d) ─────────────────────────────────── */
.editor-loading {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--color-ink-3, #a1a1aa);
}

.editor-spin {
  animation: editor-spin 0.9s linear infinite;
}

@keyframes editor-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Top toolbar (RC-36): app-consistent chrome ───────────────────── */
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
    background-color 0.12s ease,
    color 0.12s ease;
}

.editor-iconbtn--sm {
  width: 26px;
  height: 26px;
  border-radius: 6px;
}

.editor-iconbtn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.editor-iconbtn:disabled {
  opacity: 0.5;
  cursor: default;
}

.editor-iconbtn--active {
  background: var(--color-selected, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
}

.editor-iconbtn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

/* Font-size stepper: a compact segmented pill (− 14px +). */
.editor-fontsize {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 2px;
  border-radius: 8px;
  background: var(--color-canvas, #fafaf9);
  border: 1px solid var(--color-line, #ececec);
}

.editor-fontsize__val {
  min-width: 40px;
  text-align: center;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--color-ink-2, #52525b);
  font-variant-numeric: tabular-nums;
}

/* Primary Save button. */
.editor-savebtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 7px;
  border: 0;
  background: var(--color-accent, #5e6ad2);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    opacity 0.12s ease;
}

.editor-savebtn:hover:not(:disabled) {
  background: var(--color-accent-strong, #4e5ac0);
}

.editor-savebtn:disabled {
  opacity: 0.7;
  cursor: default;
}

.editor-savebtn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

/* ── Sub-toolbar: breadcrumbs left + clipboard tools right ────────── */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  min-height: 36px;
}

.editor-header__crumbs {
  flex: 1;
  min-width: 0;
}

.editor-header__tools {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.editor-tool {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.editor-tool:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.editor-tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.editor-tool:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}
</style>
