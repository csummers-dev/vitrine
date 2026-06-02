<template>
  <BaseModal v-if="dialog.isOpen.value" @closed="dialog.close">
    <div class="confirm-prompt" @click.stop>
      <div class="confirm-prompt__body">
        <div class="confirm-prompt__icon is-info">
          <Icon name="star" :size="18" :stroke-width="1.6" />
        </div>
        <div class="confirm-prompt__text">
          <h2 class="confirm-prompt__title">Favorites display title</h2>
          <p class="confirm-prompt__message">
            Choose how
            <strong class="fav-title__folder">{{ folderName }}</strong> appears
            in your Favorites. This only changes the sidebar label — the folder
            itself is untouched.
          </p>
          <input
            id="focus-prompt"
            ref="inputEl"
            v-model="value"
            type="text"
            class="fav-title__input"
            :placeholder="folderName"
            :maxlength="80"
            spellcheck="false"
            @keydown.enter.prevent="save"
            @focus="selectAll"
          />
          <p class="fav-title__hint">Leave blank to use the folder name.</p>
        </div>
      </div>
      <div class="confirm-prompt__actions">
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--ghost"
          @click="dialog.close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="confirm-prompt__btn confirm-prompt__btn--primary"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * FavoriteTitleDialog — edits the custom sidebar display name for a pinned
 * folder. Opened from the row right-click menu and the section ⋯ menu via the
 * `useFavoriteTitleDialog` singleton (which carries the target path). Mounted
 * once in FileListing. Writes through `useFavorites().setTitle`, which only
 * touches the prefs alias map — never the real folder.
 */
import { computed, nextTick, ref, watch } from "vue";
import BaseModal from "@/components/prompts/BaseModal.vue";
import Icon from "@/components/Icon.vue";
import { useFavorites } from "@/composables/useFavorites";
import { useFavoriteTitleDialog } from "@/composables/useFavoriteTitleDialog";

const dialog = useFavoriteTitleDialog();
const favorites = useFavorites();

const value = ref<string>("");
const inputEl = ref<HTMLInputElement | null>(null);

/** Basename of the target path — the default label + the input placeholder. */
const folderName = computed<string>(() => {
  const trimmed = String(dialog.targetPath.value).replace(/\/+$/, "");
  const last = trimmed.split("/").filter(Boolean).pop() ?? trimmed;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
});

// Seed the field with the currently-stored title each time the dialog opens.
watch(
  () => dialog.isOpen.value,
  (open) => {
    if (open) {
      value.value = favorites.titleFor(dialog.targetPath.value);
      void nextTick(() => inputEl.value?.focus());
    }
  }
);

const selectAll = () => inputEl.value?.select();

const save = () => {
  favorites.setTitle(dialog.targetPath.value, value.value);
  dialog.close();
};
</script>

<style scoped>
.fav-title__folder {
  color: var(--color-ink-1, #18181b);
  font-weight: 600;
  word-break: break-word;
}

.fav-title__input {
  margin-top: 12px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-1, #18181b);
  font-family: inherit;
  font-size: 13.5px;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.fav-title__input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
}

.fav-title__input:focus {
  outline: none;
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.25));
}

.fav-title__hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}
</style>
