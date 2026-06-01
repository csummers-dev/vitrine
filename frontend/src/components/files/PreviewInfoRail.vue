<template>
  <div class="preview-info">
    <!-- ── Header: file-type squircle + filename ─────────────────── -->
    <div class="preview-info__section">
      <div class="preview-info__header">
        <span class="preview-info__icon" :class="iconColorClass">
          <Icon :name="iconName" :size="20" :stroke-width="1.8" />
        </span>
        <div class="preview-info__header-text">
          <div class="preview-info__eyebrow">{{ typeLabel }}</div>
          <div class="preview-info__name">{{ name }}</div>
        </div>
      </div>

      <!-- Primary action grid — same chrome / shape as InfoPane
           (Stage 11d). Share / Download / Rename / Delete. -->
      <div class="preview-info__primary">
        <button
          v-if="canShare"
          class="info-action"
          title="Share"
          @click="$emit('share')"
        >
          <Icon name="share" :size="14" />
          <span>Share</span>
        </button>
        <button
          v-if="canDownload"
          class="info-action"
          title="Download"
          @click="$emit('download')"
        >
          <Icon name="download" :size="14" />
          <span>Download</span>
        </button>
        <button
          v-if="canRename"
          class="info-action"
          title="Rename"
          @click="$emit('rename')"
        >
          <Icon name="pencil" :size="14" />
          <span>Rename</span>
        </button>
        <button
          v-if="canDelete"
          class="info-action info-action--danger"
          title="Delete"
          @click="$emit('delete')"
        >
          <Icon name="trash-2" :size="14" />
          <span>Delete</span>
        </button>
      </div>

      <!-- Secondary action row — Move / Copy / Extract / Open direct.
           Extract slides in only for .zip files where the user can
           create files (same gate as InfoPane). This is the in-preview
           equivalent of the row-level Extract button. -->
      <div class="preview-info__secondary">
        <button
          v-if="canMove"
          class="info-action"
          title="Move"
          @click="$emit('move')"
        >
          <Icon name="forward" :size="14" />
          <span>Move</span>
        </button>
        <button
          v-if="canCopy"
          class="info-action"
          title="Copy"
          @click="$emit('copy')"
        >
          <Icon name="copy" :size="14" />
          <span>Copy</span>
        </button>
        <button
          v-if="canExtract"
          class="info-action"
          title="Extract zip"
          @click="$emit('extract')"
        >
          <Icon name="package-open" :size="14" />
          <span>Extract</span>
        </button>
        <button
          v-if="canOpenDirect"
          class="info-action"
          title="Open in new tab"
          @click="$emit('openDirect')"
        >
          <Icon name="external-link" :size="14" />
          <span>Open</span>
        </button>
      </div>
    </div>

    <!-- ── Properties (size / modified / extension / etc.) ────────── -->
    <div class="preview-info__section">
      <div class="preview-info__label">Properties</div>
      <dl class="preview-info__dl">
        <div v-if="sizeLabel" class="preview-info__row">
          <dt>Size</dt>
          <dd class="tabular">{{ sizeLabel }}</dd>
        </div>
        <div v-if="modifiedLabel" class="preview-info__row">
          <dt>Modified</dt>
          <dd class="tabular">{{ modifiedLabel }}</dd>
        </div>
        <div v-if="extensionLabel" class="preview-info__row">
          <dt>Extension</dt>
          <dd class="mono preview-info__ext">{{ extensionLabel }}</dd>
        </div>
        <slot name="extra-properties" />
      </dl>
    </div>

    <!-- ── Format-specific section (EXIF, ID3, tracks, etc.) ─────── -->
    <div v-if="$slots['format-section']" class="preview-info__section">
      <slot name="format-section" />
    </div>

    <!-- ── Location (file path) ─────────────────────────────────── -->
    <div v-if="path" class="preview-info__section">
      <div class="preview-info__label">Location</div>
      <div class="preview-info__path">{{ path }}</div>
    </div>

    <!-- Anything else the viewer wants to pin to the bottom. -->
    <slot name="footer-section" />

    <div class="preview-info__spacer"></div>

    <!-- ── Keyboard hint footer ──────────────────────────────────── -->
    <div v-if="$slots['keyboard-hints']" class="preview-info__keyboard">
      <slot name="keyboard-hints" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The persistent right-rail of the preview shell. Mirrors the action
 * grid + properties pattern from InfoPane (Stage 11d) so the user gets
 * the same affordances they're used to from the file listing.
 *
 * Per-format viewers pass a `format-section` slot with the relevant
 * metadata (EXIF for images, tracks/codec for video, ID3 for audio,
 * document metadata for PDF, etc.). Everything else is generic.
 */
import Icon from "@/components/Icon.vue";

defineProps<{
  name: string;
  iconName: string;
  iconColorClass?: string;
  /** Capitalized eyebrow above the filename ("Image · JPEG"). */
  typeLabel: string;
  sizeLabel?: string;
  modifiedLabel?: string;
  extensionLabel?: string;
  path?: string;
  canShare?: boolean;
  canDownload?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  canMove?: boolean;
  canCopy?: boolean;
  canExtract?: boolean;
  canOpenDirect?: boolean;
}>();

defineEmits<{
  (e: "share"): void;
  (e: "download"): void;
  (e: "rename"): void;
  (e: "delete"): void;
  (e: "move"): void;
  (e: "copy"): void;
  (e: "extract"): void;
  (e: "openDirect"): void;
}>();
</script>

<style scoped>
.preview-info {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview-info__section {
  padding: 16px;
  border-bottom: 1px solid var(--color-line, #ececec);
}
.preview-info__section:last-of-type {
  border-bottom: 0;
}

.preview-info__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.preview-info__icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
}

/* Same per-type squircle tints as the toolbar */
.preview-info__icon.is-image {
  background: rgba(236, 72, 153, 0.16);
  color: #be185d;
}
.preview-info__icon.is-video {
  background: rgba(99, 102, 241, 0.16);
  color: #4338ca;
}
.preview-info__icon.is-audio {
  background: rgba(250, 204, 21, 0.22);
  color: #a16207;
}
.preview-info__icon.is-pdf {
  background: rgba(244, 63, 94, 0.16);
  color: #be123c;
}
.preview-info__icon.is-text {
  background: rgba(82, 82, 91, 0.12);
  color: #3f3f46;
}
.preview-info__icon.is-archive {
  background: rgba(251, 146, 60, 0.16);
  color: #c2410c;
}
.preview-info__icon.is-epub {
  background: rgba(20, 184, 166, 0.16);
  color: #0f766e;
}
.preview-info__icon.is-csv {
  background: rgba(34, 197, 94, 0.16);
  color: #15803d;
}

html.dark .preview-info__icon.is-image {
  background: rgba(244, 114, 182, 0.22);
  color: #fbcfe8;
}
html.dark .preview-info__icon.is-video {
  background: rgba(129, 140, 248, 0.22);
  color: #c7d2fe;
}
html.dark .preview-info__icon.is-audio {
  background: rgba(250, 204, 21, 0.2);
  color: #fde68a;
}
html.dark .preview-info__icon.is-pdf {
  background: rgba(251, 113, 133, 0.22);
  color: #fecdd3;
}
html.dark .preview-info__icon.is-text {
  background: rgba(161, 161, 170, 0.18);
  color: #e4e4e7;
}
html.dark .preview-info__icon.is-archive {
  background: rgba(251, 146, 60, 0.22);
  color: #fdba74;
}
html.dark .preview-info__icon.is-epub {
  background: rgba(45, 212, 191, 0.22);
  color: #99f6e4;
}
html.dark .preview-info__icon.is-csv {
  background: rgba(74, 222, 128, 0.2);
  color: #bbf7d0;
}

.preview-info__header-text {
  min-width: 0;
  flex: 1;
}
.preview-info__eyebrow {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-ink-3, #a1a1aa);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}
.preview-info__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  line-height: 1.25;
  word-break: break-all;
}

/* ── Action grids ────────────────────────────────────────────────────── */
/* RC-39: centered flex (not a fixed N-col grid) so a row with fewer than
   its max actions centers its buttons instead of leaving empty trailing
   columns. Each button caps at the N-up cell width, so 2 actions sit at
   ~2/3 width centered rather than left-aligned with an empty 3rd slot
   (repro: an image in preview where Open/Extract aren't shown). */
.preview-info__primary,
.preview-info__secondary {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.preview-info__primary {
  margin-bottom: 6px;
}
.preview-info__primary > .info-action {
  flex: 1 1 0;
  min-width: 0;
  max-width: calc((100% - 18px) / 4);
}
.preview-info__secondary > .info-action {
  flex: 1 1 0;
  min-width: 0;
  max-width: calc((100% - 12px) / 3);
}

/* `info-action` is the same class FileListing's InfoPane uses — kept
   un-scoped so we share the chrome tokens. Style is defined in the
   InfoPane and inherited here via the global stylesheet load order. */
.preview-info :deep(.info-action),
.preview-info .info-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
  min-width: 0;
}
.preview-info .info-action:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.preview-info .info-action--danger:hover {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}
html.dark .preview-info .info-action--danger:hover {
  background: rgba(127, 29, 29, 0.16);
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.4);
}

/* ── Label + property rows ───────────────────────────────────────────────
   Each rule is duplicated with `:slotted(...)` so the styles apply to
   BOTH this component's own template (Properties, Location) AND the
   format-section slot content (audio Track/Codec, image Camera EXIF,
   video Tracks). Without `:slotted()`, slot content carries the parent
   component's scope ID (Preview.vue's), not ours — Vue 3 scoped CSS
   would skip it and the metadata rendered as unformatted dt/dd pairs. */
.preview-info__label,
:slotted(.preview-info__label) {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-bottom: 10px;
}

.preview-info__dl,
:slotted(.preview-info__dl) {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.preview-info__row,
:slotted(.preview-info__row) {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.preview-info__row dt,
:slotted(.preview-info__row dt) {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}
.preview-info__row dd,
:slotted(.preview-info__row dd) {
  color: var(--color-ink-1, #18181b);
  text-align: right;
  margin: 0;
  /* Allow long values (titles with many words, file paths embedded in
     metadata) to wrap rather than overflow the rail. */
  min-width: 0;
  word-break: break-word;
}
.preview-info__ext,
:slotted(.preview-info__ext) {
  font-size: 11px;
}

.tabular,
:slotted(.tabular) {
  font-variant-numeric: tabular-nums;
}
.mono,
:slotted(.mono) {
  font-family: var(--font-mono, monospace);
}

.preview-info__path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--color-ink-2, #52525b);
  word-break: break-all;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  padding: 6px 8px;
}

.preview-info__spacer {
  flex: 1;
}

/* ── Keyboard hints footer ──────────────────────────────────────────── */
.preview-info__keyboard {
  padding: 12px 16px;
  border-top: 1px solid var(--color-line, #ececec);
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}
.preview-info__keyboard :deep(kbd),
.preview-info__keyboard kbd {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-1, #18181b);
  line-height: 1.4;
}
</style>
