<template>
  <BaseModal v-if="dialog.isOpen.value" @closed="dialog.close">
    <form
      class="confirm-prompt save-search"
      data-testid="save-search-dialog"
      @click.stop
      @submit.prevent="save"
    >
      <div class="confirm-prompt__body">
        <div class="confirm-prompt__icon is-info">
          <Icon name="folder-search" :size="18" :stroke-width="1.6" />
        </div>
        <div class="confirm-prompt__text">
          <h2 class="confirm-prompt__title">
            {{ editing ? "Edit saved search" : "Save search" }}
          </h2>
          <p class="confirm-prompt__message">
            Saved searches show in the sidebar and keep up to date as files
            change.
          </p>

          <label class="save-search__label" for="save-search-name">Name</label>
          <input
            id="save-search-name"
            ref="nameEl"
            v-model="name"
            type="text"
            class="save-search__input"
            :placeholder="query || 'Recent photos'"
            maxlength="80"
            spellcheck="false"
          />

          <label class="save-search__label" for="save-search-query"
            >Search for</label
          >
          <input
            id="save-search-query"
            v-model="query"
            type="text"
            class="save-search__input save-search__input--mono"
            placeholder="type:image added:30d"
            spellcheck="false"
            autocomplete="off"
          />
          <p
            v-if="reading"
            class="save-search__reading"
            data-testid="save-search-reading"
          >
            {{ reading }}
          </p>
          <div v-else class="save-search__examples">
            <span class="save-search__hint">Try</span>
            <button
              v-for="ex in SEARCH_EXAMPLES"
              :key="ex.query"
              type="button"
              class="save-search__example"
              :title="ex.label"
              @click="useExample(ex)"
            >
              {{ ex.query }}
            </button>
          </div>
          <p class="save-search__hint save-search__syntax">
            type:image · video · audio · pdf — size:&gt;4GB · size:&lt;10MB —
            added:7d · 2w · 6m — tag:name — ext:mkv — plus any words in the
            name.
          </p>

          <label class="save-search__where">
            <input
              v-model="everywhere"
              type="checkbox"
              :disabled="draftFolder === '/'"
            />
            <span v-if="draftFolder === '/'"
              >Searches all of {{ rootName }}</span
            >
            <span v-else
              >Search all of {{ rootName }}, not just
              <strong>{{ folderName }}</strong></span
            >
          </label>
        </div>
      </div>
      <div class="confirm-prompt__actions">
        <UiButton size="sm" @click="dialog.close"> Cancel </UiButton>
        <UiButton
          variant="primary"
          size="sm"
          type="submit"
          :disabled="!query.trim()"
        >
          Save
        </UiButton>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import UiButton from "@/components/ui/UiButton.vue";
/**
 * Save / edit a saved search (4.0 Phase 5.3). Opened from the search box,
 * the command palette, the sidebar and the results header through
 * `useSaveSearchDialog`; mounted once in App.vue.
 */
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BaseModal from "@/components/prompts/BaseModal.vue";
import Icon from "@/components/Icon.vue";
import {
  SEARCH_EXAMPLES,
  folderLabel,
  savedSearchUrl,
  useSavedSearches,
  useSaveSearchDialog,
} from "@/composables/useSavedSearches";
import { describeQuery, parseQuery } from "@/utils/searchQuery";
import { useRootLabel } from "@/composables/useRootLabel";
import { useFileStore } from "@/stores/file";

const dialog = useSaveSearchDialog();
const saved = useSavedSearches();
const router = useRouter();
const fileStore = useFileStore();
const { t } = useI18n();
const { rootLabel } = useRootLabel();

const name = ref("");
const query = ref("");
const everywhere = ref(false);
const nameEl = ref<HTMLInputElement | null>(null);

const editing = computed(() => !!dialog.draft.value.id);
const draftFolder = computed(() => dialog.draft.value.folder);
const rootName = computed(() => rootLabel.value || t("sidebar.myFiles"));
const folderName = computed(() =>
  folderLabel(draftFolder.value, rootName.value)
);
const reading = computed(() => describeQuery(parseQuery(query.value)));

watch(
  () => dialog.isOpen.value,
  (open) => {
    if (!open) return;
    name.value = dialog.draft.value.name;
    query.value = dialog.draft.value.query;
    everywhere.value = false;
    void nextTick(() => nameEl.value?.focus());
  }
);

const useExample = (ex: { label: string; query: string }) => {
  query.value = ex.query;
  if (!name.value.trim()) name.value = ex.label;
};

const save = () => {
  if (!query.value.trim()) return;
  const entry = saved.save({
    id: dialog.draft.value.id,
    name: name.value,
    query: query.value,
    folder: everywhere.value ? "/" : draftFolder.value,
  });
  dialog.close();
  const target = savedSearchUrl(entry);
  if (router.currentRoute.value.fullPath === target) {
    fileStore.reload = true; // same URL: re-run in place
  } else {
    void router.push(target);
  }
};
</script>

<style scoped>
.save-search {
  width: min(480px, calc(100vw - 32px));
}
.save-search__label {
  display: block;
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-2);
}
.save-search__input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--color-line);
  background: var(--color-canvas);
  color: var(--color-ink-1);
  font-family: inherit;
  font-size: 13.5px;
}
.save-search__input--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
}
.save-search__input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-ring);
}
.save-search__reading {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-ink-2);
}
.save-search__examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}
.save-search__example {
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--color-ink-2);
}
.save-search__example:hover {
  border-color: var(--color-accent);
  color: var(--color-ink-1);
}
.save-search__hint {
  font-size: 11.5px;
  color: var(--color-ink-3);
}
.save-search__syntax {
  margin: 8px 0 0;
  line-height: 1.5;
}
.save-search__where {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--color-ink-2);
}
</style>
