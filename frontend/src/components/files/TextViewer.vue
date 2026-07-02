<template>
  <div class="text-viewer">
    <!-- ── Rendered markdown (S5-2) ─────────────────────────────────
         Shown for .md/.markdown files when the toolbar's Rendered
         toggle is on. Renders via `marked` (already a dep) + KaTeX
         math, sanitized through DOMPurify. -->
    <div
      v-if="isMarkdown && rendered"
      class="text-viewer__card text-viewer__card--md"
    >
      <!-- eslint-disable-next-line vue/no-v-html — sanitized above -->
      <div class="markdown-body" v-html="renderedHtml"></div>
    </div>

    <!-- ── Raw text (default) ──────────────────────────────────────── -->
    <div v-else class="text-viewer__card">
      <pre
        v-if="content"
        class="text-viewer__pre"
        :class="{ 'text-viewer__pre--wrap': softWrap }"
      ><code class="text-viewer__code">{{ content }}</code></pre>
      <div v-else class="text-viewer__empty">
        <Icon name="file-text" :size="20" :stroke-width="1.4" />
        <span>Empty file</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Read-only text preview. Two modes:
 *   - raw: a styled <pre><code> block (the default; the calm read
 *     surface — the full Ace editor lives in Editor.vue).
 *   - rendered markdown (S5-2): for .md / .markdown files, the toolbar
 *     can flip `rendered` on to show formatted output via `marked`
 *     (GFM by default in v18) + KaTeX math, sanitized with DOMPurify.
 *
 * We reuse the existing `marked` + `marked-katex-extension` + DOMPurify
 * stack (already shipped for Editor.vue's live preview) rather than
 * pulling in a second markdown library.
 */
import { ref, watchEffect } from "vue";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  content: string;
  /** When true, long lines wrap instead of horizontally scrolling. */
  softWrap?: boolean;
  /** True for .md / .markdown files — enables the rendered mode. */
  isMarkdown?: boolean;
  /** When true (and isMarkdown), show rendered output instead of raw. */
  rendered?: boolean;
}>();

// Configure marked once. GFM is the default in marked v18 (tables,
// strikethrough, autolinks); KaTeX adds inline + block math. `marked.use`
// mutates global marked state — harmless if Editor.vue also registered
// the same extension.
marked.use(markedKatex({ output: "mathml", throwOnError: false }));

// Open rendered-markdown links in a new tab so clicking one doesn't
// navigate the SPA away from the preview. Module-scope: runs once.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const renderedHtml = ref<string>("");

// Recompute whenever content / mode changes. marked.parse can be async
// (extensions may be), so await it. Sanitize before binding to v-html.
watchEffect(async () => {
  if (!props.isMarkdown || !props.rendered) {
    renderedHtml.value = "";
    return;
  }
  try {
    const raw = await marked.parse(props.content || "");
    renderedHtml.value = DOMPurify.sanitize(raw);
  } catch {
    renderedHtml.value = "";
  }
});
</script>

<style scoped>
.text-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: center;
  /* 2.1 #4: drop the text card below the floating Exit button (top-left, ~44px
     tall) so it never overlaps the card or its first lines. On wide viewports
     the card is centred and the Exit sits in the side margin anyway; this keeps
     it clear on narrow ones too. */
  padding: 52px 0 0;
}

.text-viewer__card {
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

.text-viewer__pre {
  flex: 1;
  margin: 0;
  padding: 18px 22px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-ink-1, #18181b);
  background: var(--color-surface, #fff);
  tab-size: 2;
  white-space: pre;
}

.text-viewer__pre--wrap {
  white-space: pre-wrap;
  word-break: break-word;
}

.text-viewer__code {
  font-family: inherit;
  font-size: inherit;
  font-variant-numeric: tabular-nums;
  background: transparent;
  padding: 0;
}

.text-viewer__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
}

html.dark .text-viewer__card,
html.dark .text-viewer__pre {
  background: var(--color-surface);
}

/* ── Rendered markdown body (S5-2) ───────────────────────────────────
   GitHub-ish typography, tokenized so it tracks light + dark themes.
   The body scrolls inside the card; max line-width keeps prose
   readable on wide screens. */
.text-viewer__card--md {
  overflow-y: auto;
}
.markdown-body {
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 40px 64px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-ink-1, #18181b);
  word-wrap: break-word;
}
@media (max-width: 640px) {
  .markdown-body {
    padding: 20px 18px 48px;
    font-size: 14.5px;
  }
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-weight: 600;
  line-height: 1.3;
  margin: 1.6em 0 0.6em;
  color: var(--color-ink-1, #18181b);
}
.markdown-body :deep(h1) {
  font-size: 1.9em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--color-line, #ececec);
}
.markdown-body :deep(h2) {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--color-line, #ececec);
}
.markdown-body :deep(h3) {
  font-size: 1.25em;
}
.markdown-body :deep(h4) {
  font-size: 1.05em;
}
.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(table),
.markdown-body :deep(pre) {
  margin: 0 0 1em;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.6em;
}
.markdown-body :deep(li) {
  margin: 0.25em 0;
}
.markdown-body :deep(li > p) {
  margin: 0.4em 0;
}

.markdown-body :deep(a) {
  color: var(--color-accent, #6e72d9);
  text-decoration: none;
}
.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(blockquote) {
  padding: 0.2em 1em;
  border-left: 3px solid var(--color-line-strong, #d4d4d8);
  color: var(--color-ink-2, #52525b);
}

.markdown-body :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 0.88em;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.markdown-body :deep(pre) {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  overflow-x: auto;
}
.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 0.86em;
  line-height: 1.55;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 6px 13px;
  border: 1px solid var(--color-line, #ececec);
}
.markdown-body :deep(th) {
  font-weight: 600;
  background: var(--color-elevated, #f4f4f5);
}
.markdown-body :deep(tr:nth-child(2n) td) {
  background: var(--color-canvas, #fafaf9);
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
.markdown-body :deep(hr) {
  height: 1px;
  border: 0;
  margin: 1.8em 0;
  background: var(--color-line, #ececec);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2) {
  border-color: var(--color-line, #ececec);
}
</style>
