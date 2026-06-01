<template>
  <div id="search" ref="root" v-bind:class="{ active, ongoing }">
    <!-- Inactive: button-shaped placeholder (matches mockup) -->
    <button
      v-if="!active"
      type="button"
      class="search-trigger"
      @click="open"
      :aria-label="$t('search.search')"
    >
      <Icon name="search" :size="14" />
      <span class="search-trigger__label"
        >Search files, folders, or actions…</span
      >
      <kbd class="search-kbd">⌘K</kbd>
    </button>

    <!-- Active: input field, mirrors the trigger's chrome -->
    <div v-else id="input">
      <Icon name="search" :size="14" />
      <input
        type="text"
        ref="input"
        :autofocus="active"
        v-model.trim="prompt"
        :aria-label="$t('search.search')"
        :placeholder="$t('search.search')"
        @keydown.esc.prevent="close"
        @keyup.enter="submit"
      />
      <Icon v-show="ongoing" name="loader-circle" class="spin" />
      <span v-show="results.length > 0" class="search-count">
        {{ results.length }}
      </span>
      <kbd v-if="!ongoing" class="search-kbd">⌘K</kbd>
    </div>

    <div
      v-show="active && (results.length > 0 || showEmptyState)"
      id="result"
      ref="result"
    >
      <!-- Empty state: query typed, no matches, not still searching -->
      <div v-if="results.length === 0 && showEmptyState" class="search-empty">
        <Icon name="search-x" :size="18" :stroke-width="1.4" />
        <span>No results for &ldquo;{{ prompt }}&rdquo;</span>
      </div>

      <ul v-else class="search-results">
        <li v-for="(s, k) in filteredResults" :key="k">
          <router-link class="search-result-row" v-on:click="close" :to="s.url">
            <div class="search-result-icon" :class="resultIconColor(s)">
              <Icon :name="resultIconName(s)" :size="14" :stroke-width="1.6" />
            </div>
            <div class="search-result-text">
              <span class="search-result-name">{{ resultName(s) }}</span>
              <span class="search-result-path">{{ resultPath(s) }}</span>
            </div>
          </router-link>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

import url from "@/utils/url";
import { searchSmart } from "@/utils/searchSmart";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { computed, inject, onMounted, ref, watch, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { StatusError } from "@/api/utils";

const layoutStore = useLayoutStore();
const fileStore = useFileStore();
let searchAbortController = new AbortController();

const { currentPromptName } = storeToRefs(layoutStore);

const prompt = ref<string>("");
const active = ref<boolean>(false);
const ongoing = ref<boolean>(false);
const results = ref<any[]>([]);
const resultsCount = ref<number>(50);

const $showError = inject<IToastError>("$showError")!;

const input = ref<HTMLInputElement | null>(null);
const result = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);

const route = useRoute();

// Drive `active` off the layoutStore so external `showHover("search")` /
// `closeHovers()` calls open/close the search the same way an in-component
// click does.
watch(currentPromptName, (newVal, oldVal) => {
  active.value = newVal === "search";
  if (oldVal === "search" && !active.value) {
    reset();
    prompt.value = "";
    input.value?.blur();
  } else if (active.value) {
    input.value?.focus();
  }
});

// Search-as-you-type: clear current results on every keystroke, then trigger
// a fresh search 180ms after the user stops typing. Sub-2-char queries skip
// the fetch (avoids hammering the backend on a single character).
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 180;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const cancelPendingSearch = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
};

watch(prompt, () => {
  reset();
  cancelPendingSearch();
  if (prompt.value.trim().length < SEARCH_MIN_CHARS) return;
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    void runSearch();
  }, SEARCH_DEBOUNCE_MS);
});

const filteredResults = computed(() =>
  results.value.slice(0, resultsCount.value)
);

// Backend search returns `{dir, path}`. Build a display name from the basename
// of the path, and route the icon system through the existing fileIcon helpers
// so the dropdown matches the squircle treatment used elsewhere.
const resultName = (s: { path: string }) => {
  const segments = s.path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || s.path;
};
const resultPath = (s: { path: string }) => {
  const name = resultName(s);
  const dir = s.path.slice(0, s.path.length - name.length).replace(/\/+$/, "");
  return dir ? `./${dir}` : "./";
};
const resultIconName = (s: { dir: boolean; path: string }) =>
  fileIcon({ isDir: s.dir, name: resultName(s) });
const resultIconColor = (s: { dir: boolean; path: string }) =>
  fileIconColor({ isDir: s.dir, name: resultName(s) });

// Empty-state hint: only show after the user has typed enough and we're not
// mid-search (so we don't briefly flash "no results" while typing).
const showEmptyState = computed(
  () => prompt.value.trim().length >= 2 && !ongoing.value
);

// Click-outside-to-close: when the search overlay is active and the user
// clicks anywhere outside the #search root, dismiss it. Critical at narrow
// widths where the input renders as a floating overlay over the header.
const handleDocumentMousedown = (event: MouseEvent) => {
  if (!active.value) return;
  const target = event.target as Node | null;
  if (root.value && target && !root.value.contains(target)) {
    layoutStore.closeHovers();
  }
};

onMounted(() => {
  document.addEventListener("mousedown", handleDocumentMousedown);
  if (result.value === null) return;
  // Lazy-load more streamed results as the user scrolls near the bottom.
  result.value.addEventListener("scroll", (event: Event) => {
    const el = event.target as HTMLElement;
    if (el.offsetHeight + el.scrollTop >= el.scrollHeight - 100) {
      resultsCount.value += 50;
    }
  });
});

onUnmounted(() => {
  document.removeEventListener("mousedown", handleDocumentMousedown);
  cancelPendingSearch();
  abortLastSearch();
});

const open = () => {
  if (!active.value) layoutStore.showHover("search");
};

const close = (event: Event) => {
  if (ongoing.value) {
    abortLastSearch();
    ongoing.value = false;
  } else {
    event.stopPropagation();
    event.preventDefault();
    layoutStore.closeHovers();
  }
};

const reset = () => {
  abortLastSearch();
  ongoing.value = false;
  resultsCount.value = 50;
  results.value = [];
};

const abortLastSearch = () => {
  searchAbortController.abort();
};

const runSearch = async () => {
  if (prompt.value.trim() === "") return;

  let path = route.path;
  if (!fileStore.isListing) {
    path = url.removeLastDir(path) + "/";
  }

  ongoing.value = true;
  try {
    abortLastSearch();
    searchAbortController = new AbortController();
    results.value = [];
    // searchSmart routes through /api/search/recursive when the query
    // has tag:/ext: filters; otherwise falls through to the streaming
    // endpoint. The SearchHit shape carries both `path` and `url` so
    // the existing template renders can keep using the same fields
    // without caring which backend served the result.
    await searchSmart(path, prompt.value, searchAbortController.signal, (hit) =>
      results.value.push(hit)
    );
  } catch (error: any) {
    if (error instanceof StatusError && error.is_canceled) return;
    $showError(error);
  }
  ongoing.value = false;
};

// Pressing Enter explicitly skips the debounce and fires immediately.
const submit = async (event: Event) => {
  event.preventDefault();
  cancelPendingSearch();
  await runSearch();
};
</script>
