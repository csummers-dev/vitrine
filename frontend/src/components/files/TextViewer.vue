<template>
  <div class="text-viewer">
    <div class="text-viewer__card">
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
 * Read-only text preview using a styled <pre><code> block. The full
 * Ace editor lives in Editor.vue (still reachable via the "Edit" /
 * `?edit=true` flow); this viewer is the calm read surface.
 *
 * Why no Ace here: Ace is heavy (~600 KB), the read scenario doesn't
 * need code-folding / multi-cursor / etc., and a simple pre+code block
 * inherits monospaced + tabular kerning from our design tokens for
 * free. Syntax highlighting can be layered on later via Shiki or
 * Prism if the user asks for it.
 */
import Icon from "@/components/Icon.vue";

defineProps<{
  content: string;
  /** When true, long lines wrap instead of horizontally scrolling. */
  softWrap?: boolean;
}>();
</script>

<style scoped>
.text-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 0;
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
</style>
