<template>
  <!-- The preview's details rail (Phase 6, 6.1): laid out like the files
       view's details panel — name, kind, the main actions with the rest in
       a ⋯ menu, then Information, the format's own section and Where. -->
  <div class="preview-info">
    <div class="pi-head">
      <span class="pi-head__tile" :class="iconColorClass" aria-hidden="true">
        <Icon :name="iconName" :size="18" :stroke-width="1.8" />
      </span>
      <div class="pi-head__text">
        <h2 class="pi-head__name">{{ name }}</h2>
        <p class="pi-head__sub">
          {{ typeLabel
          }}<template v-if="sizeLabel"> · {{ sizeLabel }}</template>
        </p>
      </div>
    </div>

    <div class="pi-actions">
      <UiButton v-if="canShare" size="sm" icon="share" @click="$emit('share')"
        >Share</UiButton
      >
      <UiButton
        v-if="canDownload"
        size="sm"
        icon="download"
        @click="$emit('download')"
        >Download</UiButton
      >
      <UiIconButton
        v-if="menuItems.length > 0"
        icon="ellipsis"
        size="sm"
        variant="secondary"
        :label="`More actions for ${name}`"
        @click="openMenu"
      />
    </div>

    <section class="pi-section" aria-labelledby="pi-info">
      <h3 id="pi-info" class="pi-section__title">Information</h3>
      <dl class="pi-props">
        <div v-if="sizeLabel">
          <dt>Size</dt>
          <dd class="tabular">{{ sizeLabel }}</dd>
        </div>
        <div v-if="modifiedLabel">
          <dt>Modified</dt>
          <dd class="tabular">{{ modifiedLabel }}</dd>
        </div>
        <div v-if="extensionLabel">
          <dt>Extension</dt>
          <dd class="pi-mono">{{ extensionLabel }}</dd>
        </div>
        <slot name="extra-properties" />
      </dl>
    </section>

    <!-- Format-specific section (EXIF, ID3, tracks, text options…). -->
    <section v-if="$slots['format-section']" class="pi-section">
      <slot name="format-section" />
    </section>

    <section v-if="path" class="pi-section" aria-labelledby="pi-where">
      <h3 id="pi-where" class="pi-section__title">Where</h3>
      <p class="pi-path">{{ path }}</p>
    </section>

    <slot name="footer-section" />

    <div class="pi-spacer"></div>

    <div v-if="$slots['keyboard-hints']" class="pi-keys">
      <slot name="keyboard-hints" />
    </div>

    <ContextMenu
      :show="menu.show"
      :pos="menu.pos"
      :items="menuItems"
      @hide="menu.show = false"
    />
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
import { computed, reactive } from "vue";
import Icon from "@/components/Icon.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiIconButton from "@/components/ui/UiIconButton.vue";

const props = defineProps<{
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
  canEditTags?: boolean;
  canOpenDirect?: boolean;
}>();

const emit = defineEmits<{
  (e: "share"): void;
  (e: "download"): void;
  (e: "rename"): void;
  (e: "delete"): void;
  (e: "move"): void;
  (e: "copy"): void;
  (e: "extract"): void;
  (e: "editTags"): void;
  (e: "openDirect"): void;
}>();

// The less common actions live in a ⋯ menu, as in the details panel.
const menu = reactive({ show: false, pos: { x: 0, y: 0 } });
const openMenu = (e: MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  menu.pos = { x: r.left, y: r.bottom + 4 };
  menu.show = true;
};
const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];
  if (props.canRename)
    items.push({
      label: "Rename",
      icon: "pencil",
      action: () => emit("rename"),
    });
  if (props.canMove)
    items.push({ label: "Move", icon: "forward", action: () => emit("move") });
  if (props.canCopy)
    items.push({ label: "Copy", icon: "copy", action: () => emit("copy") });
  if (props.canExtract)
    items.push({
      label: "Extract",
      icon: "package-open",
      action: () => emit("extract"),
    });
  if (props.canEditTags)
    items.push({
      label: "Edit audio tags",
      icon: "music",
      action: () => emit("editTags"),
    });
  if (props.canOpenDirect)
    items.push({
      label: "Open in a new tab",
      icon: "external-link",
      action: () => emit("openDirect"),
    });
  if (props.canDelete)
    items.push(
      { type: "separator" },
      {
        label: "Delete",
        icon: "trash-2",
        destructive: true,
        action: () => emit("delete"),
      }
    );
  return items.filter(
    (it, i, all) => !(it.type === "separator" && i === 0 && all.length === 1)
  );
});
</script>

<style scoped>
.preview-info {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: var(--space-4);
}
.pi-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.pi-head__tile {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pi-head__text {
  min-width: 0;
  flex: 1;
}
.pi-head__name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-ink-1);
  overflow-wrap: anywhere;
}
.pi-head__sub {
  margin: 2px 0 0;
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
.pi-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.pi-section {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-line);
}
.pi-section__title,
.pi-section :deep(.preview-info__label) {
  margin: 0 0 var(--space-2);
  font-size: var(--type-small);
  font-weight: 600;
  color: var(--color-ink-3);
}
.pi-props {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--type-small);
}
.pi-props > div,
.pi-props :deep(.preview-info__row) {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}
.pi-props dt,
.pi-props :deep(dt) {
  color: var(--color-ink-3);
  flex-shrink: 0;
}
.pi-props dd,
.pi-props :deep(dd) {
  margin: 0;
  min-width: 0;
  color: var(--color-ink-1);
  text-align: right;
  overflow-wrap: anywhere;
}
.pi-mono,
.pi-path {
  font-family: var(--font-mono);
  font-size: 11px;
}
.pi-path {
  margin: 0;
  color: var(--color-ink-2);
  overflow-wrap: anywhere;
}
.pi-spacer {
  flex: 1;
}
.pi-keys {
  margin-top: var(--space-4);
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
