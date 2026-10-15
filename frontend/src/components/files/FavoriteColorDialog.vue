<template>
  <BaseModal v-if="dialog.isOpen.value" @closed="dialog.close">
    <UiPanel
      class="fav-color"
      title="Favorite colour"
      :description="`The dot beside ${name} in the sidebar.`"
      @click.stop
    >
      <div class="fav-color__swatches" role="radiogroup" aria-label="Colour">
        <button
          v-for="c in FAVORITE_COLORS"
          :key="c"
          type="button"
          role="radio"
          class="fav-color__swatch"
          :class="`fav-dot--${c}`"
          :aria-checked="current === c ? 'true' : 'false'"
          :aria-label="LABELS[c]"
          :title="LABELS[c]"
          :data-autofocus="current === c ? '' : undefined"
          @click="choose(c)"
        >
          <Icon
            v-if="current === c"
            name="check"
            :size="14"
            :stroke-width="3"
          />
        </button>
      </div>
      <template #footer>
        <UiButton
          size="sm"
          variant="ghost"
          :disabled="!favorites.hasChosenColor(dialog.targetPath.value)"
          @click="reset"
          >Use automatic colour</UiButton
        >
        <UiButton size="sm" @click="dialog.close">Done</UiButton>
      </template>
    </UiPanel>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * Picks the colour dot a favorite shows in the sidebar (Decision 6). The
 * choice is stored beside the favorite's custom title; "Use automatic
 * colour" goes back to the one picked from its path.
 */
import { computed } from "vue";
import BaseModal from "@/components/prompts/BaseModal.vue";
import Icon from "@/components/Icon.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiPanel from "@/components/ui/UiPanel.vue";
import {
  FAVORITE_COLORS,
  useFavorites,
  type FavoriteColor,
} from "@/composables/useFavorites";
import { useFavoriteColorDialog } from "@/composables/useFavoriteColorDialog";

const LABELS: Record<FavoriteColor, string> = {
  folder: "Blue",
  video: "Violet",
  audio: "Orange",
  image: "Green",
  pdf: "Red",
  archive: "Brown",
  epub: "Teal",
  comic: "Pink",
  csv: "Lime",
  code: "Slate",
};

const dialog = useFavoriteColorDialog();
const favorites = useFavorites();
const current = computed(() => favorites.colorFor(dialog.targetPath.value));
const name = computed(() => favorites.displayName(dialog.targetPath.value));

const choose = (c: FavoriteColor) =>
  favorites.setColor(dialog.targetPath.value, c);
const reset = () => favorites.setColor(dialog.targetPath.value, "");
</script>

<style scoped>
.fav-color {
  width: min(380px, 100%);
  box-shadow: var(--shadow-2);
}
.fav-color__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.fav-color__swatch {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--paper);
  cursor: pointer;
}
.fav-color__swatch:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
