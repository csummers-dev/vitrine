<template>
  <div id="editor-container">
    <header-bar>
      <action icon="x" :label="t('buttons.close')" @action="close()" />
      <title>{{ fileStore.req?.name ?? "" }}</title>

      <action
        icon="plus"
        @action="increaseFontSize"
        :label="t('buttons.increaseFontSize')"
      />
      <span class="editor-font-size">{{ fontSize }}px</span>
      <action
        icon="minus"
        @action="decreaseFontSize"
        :label="t('buttons.decreaseFontSize')"
      />

      <action
        v-if="authStore.user?.perm.modify"
        id="save-button"
        icon="save"
        :label="t('buttons.save')"
        @action="save()"
      />

      <action
        icon="eye"
        :label="t('buttons.preview')"
        @action="preview()"
        v-show="isMarkdownFile"
      />
    </header-bar>

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
import buttons from "@/utils/buttons";
import url from "@/utils/url";
import ace, { Ace, version as ace_version } from "ace-builds";
import "ace-builds/src-noconflict/ext-language_tools";
import modelist from "ace-builds/src-noconflict/ext-modelist";
import DOMPurify from "dompurify";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import Action from "@/components/header/Action.vue";
import HeaderBar from "@/components/header/HeaderBar.vue";
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
  editor.value?.destroy();
});

onBeforeRouteUpdate((to, from, next) => {
  if (editor.value?.session.getUndoManager().isClean()) {
    next();

    return;
  }

  layoutStore.showHover({
    prompt: "discardEditorChanges",
    confirm: (event: Event) => {
      event.preventDefault();
      next();
    },
    saveAction: async () => {
      await save();
      next();
    },
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
  const button = "save";
  buttons.loading("save");

  try {
    await api.put(route.path, editor.value?.getValue());
    editor.value?.session.getUndoManager().markClean();
    buttons.success(button);
  } catch (e: any) {
    buttons.done(button);
    $showError(e);
    if (throwError) throw e;
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

/* ── Font-size readout in the header bar ──────────────────────────── */
.editor-font-size {
  margin: 0 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
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
