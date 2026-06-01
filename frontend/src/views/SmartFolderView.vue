<template>
  <div class="sf-view">
    <!-- Header: name + edit chip + result count + reload -->
    <header class="sf-view__header">
      <div class="sf-view__title-row">
        <span
          v-if="folder"
          class="sf-view__color-dot"
          :class="`sf-view__color-dot--${folder.color}`"
        />
        <h1 class="sf-view__title">{{ folder?.name ?? "Smart folder" }}</h1>
        <button
          v-if="folder"
          type="button"
          class="sf-view__edit-btn"
          title="Edit smart folder"
          aria-label="Edit smart folder"
          @click="editOpen = true"
        >
          <Icon name="pencil" :size="12" />
        </button>
      </div>
      <p class="sf-view__query">
        <span class="sf-view__query-label">Query:</span>
        <code>{{ folder?.query || "(empty)" }}</code>
      </p>
      <p class="sf-view__count">
        <span v-if="loading">Searching…</span>
        <span v-else>
          {{ results.length }}
          {{ results.length === 1 ? "result" : "results" }}
        </span>
      </p>
    </header>

    <!-- Results -->
    <div v-if="loading" class="sf-view__loading">Loading results…</div>
    <div v-else-if="!folder" class="sf-view__empty">
      <Icon name="search-x" :size="32" :stroke-width="1.4" />
      <p>Smart folder not found.</p>
      <router-link to="/files" class="sf-view__back">Back to files</router-link>
    </div>
    <!-- S6-5: a fetch FAILURE now reads as a named error (with retry
         when transient), instead of silently looking like "no results". -->
    <EmptyState
      v-else-if="errorState"
      :icon="errorState.icon"
      :title="errorState.title"
      :hint="errorState.hint"
      :tone="errorState.tone"
    >
      <button
        v-if="errorState.retryable"
        type="button"
        class="sf-view__retry"
        @click="evaluate"
      >
        <Icon name="rotate-ccw" :size="13" />
        Try again
      </button>
    </EmptyState>
    <div v-else-if="results.length === 0" class="sf-view__empty">
      <Icon name="search" :size="32" :stroke-width="1.4" />
      <p>No files match this query.</p>
    </div>
    <ul v-else class="sf-view__results">
      <li v-for="entry in results" :key="entry.path" class="sf-view__row">
        <router-link
          :to="`/files${entry.path}`"
          class="sf-view__row-link"
          :title="entry.path"
        >
          <Icon
            :name="entry.isDir ? 'folder' : 'file'"
            :size="14"
            class="sf-view__row-icon"
          />
          <span class="sf-view__row-name">{{ entry.name }}</span>
          <span class="sf-view__row-path">{{ entry.path }}</span>
        </router-link>
      </li>
    </ul>

    <SmartFolderSheet
      :open="editOpen"
      :folder="folder"
      @cancel="editOpen = false"
      @saved="onFolderSaved"
      @deleted="onFolderDeleted"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * SmartFolderView — renders one saved smart folder's matching files
 * (v1.3 S2-6).
 *
 * Reads the folder definition from `user.preferences["smartFolders"]`
 * by id (URL :id segment). Parses its query, builds the search params,
 * and hits /api/search/recursive at the storage root.
 *
 * Intentionally a simple flat list — not the full FileListing chrome.
 * Multi-select, drag-drop, and bulk ops are excluded for v1.3; future
 * iterations can layer them on if real-world usage warrants the
 * complexity.
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import EmptyState from "@/components/EmptyState.vue";
import SmartFolderSheet from "@/components/SmartFolderSheet.vue";
import { usePreferences } from "@/composables/usePreferences";
import { useTagsStore } from "@/stores/tags";
import { tags as tagsApi } from "@/api";
import { parseQuery, buildSearchParams } from "@/utils/searchQuery";
import { describeError, type ErrorDescriptor } from "@/utils/describeError";
import { inject } from "vue";

const route = useRoute();
const router = useRouter();
const prefs = usePreferences();
const tagsStore = useTagsStore();
const $showError = inject<IToastError>("$showError")!;

const editOpen = ref(false);
const loading = ref(false);
const results = ref<RecursiveEntry[]>([]);
// S6-5: named error state (null = no error). Set on a failed evaluate
// so the UI distinguishes a fetch failure from genuinely-empty results.
const errorState = ref<ErrorDescriptor | null>(null);

const folder = computed<SmartFolder | null>(() => {
  const id = route.params.id as string;
  const list = prefs.get<SmartFolder[]>("smartFolders", []);
  return list.find((f) => f.id === id) ?? null;
});

const evaluate = async () => {
  if (!folder.value) {
    results.value = [];
    return;
  }
  loading.value = true;
  errorState.value = null;
  try {
    // Tags cache must be warm before we can map tag names to IDs.
    await tagsStore.ensureLoaded();
    const parsed = parseQuery(folder.value.query);
    const params = buildSearchParams(parsed, tagsStore.nameToId);
    // Evaluate against the storage root so the smart folder finds
    // matches anywhere in the user's scope.
    results.value = await tagsApi.searchRecursive("/files/", params);
  } catch (e) {
    // S6-5: surface a named error state instead of a silent empty list.
    // The toast still fires for users who've scrolled away, but the
    // in-place overlay is the primary, honest signal.
    errorState.value = describeError(e);
    if (e instanceof Error) $showError(e);
    results.value = [];
  } finally {
    loading.value = false;
  }
};

// Re-evaluate when the route id OR the folder definition changes
// (the latter handles edits made via the sheet).
watch(folder, evaluate, { immediate: true });

const onFolderSaved = () => {
  // Definition watch + immediate re-eval picks up the new query.
  // Nothing else to do here.
};

const onFolderDeleted = () => {
  // Bounce back to /files — there's nothing left to show.
  void router.push({ path: "/files" });
};
</script>

<style scoped>
.sf-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--color-canvas, #fafaf9);
}

.sf-view__header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--color-line, #ececec);
}

.sf-view__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.sf-view__color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sf-view__color-dot--lilac {
  background: var(--tag-color-lilac-fg);
}
.sf-view__color-dot--blue {
  background: var(--tag-color-blue-fg);
}
.sf-view__color-dot--green {
  background: var(--tag-color-green-fg);
}
.sf-view__color-dot--amber {
  background: var(--tag-color-amber-fg);
}
.sf-view__color-dot--red {
  background: var(--tag-color-red-fg);
}
.sf-view__color-dot--pink {
  background: var(--tag-color-pink-fg);
}
.sf-view__color-dot--slate {
  background: var(--tag-color-slate-fg);
}
.sf-view__color-dot--teal {
  background: var(--tag-color-teal-fg);
}

.sf-view__title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-ink-1, #18181b);
  margin: 0;
}

.sf-view__edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.sf-view__edit-btn:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-accent, #5e6ad2);
}

.sf-view__query {
  margin: 0;
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sf-view__query-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 10.5px;
}

.sf-view__query code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--color-ink-2, #52525b);
  background: var(--color-elevated, #f4f4f5);
  padding: 1px 6px;
  border-radius: 4px;
}

.sf-view__count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
}

.sf-view__loading,
.sf-view__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
}

.sf-view__back {
  font-size: 12.5px;
  color: var(--color-accent, #5e6ad2);
  text-decoration: none;
}

.sf-view__back:hover {
  text-decoration: underline;
}

/* S6-5: "Try again" retry button inside the error EmptyState. */
.sf-view__retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 7px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.sf-view__retry:hover {
  border-color: var(--color-accent, #5e6ad2);
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.08));
  color: var(--color-accent, #5e6ad2);
}

.sf-view__results {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 8px 0;
  overflow-y: auto;
}

.sf-view__row-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 24px;
  text-decoration: none;
  color: var(--color-ink-1, #18181b);
  font-size: 13px;
  transition: background-color 0.08s ease;
}

.sf-view__row-link:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
}

.sf-view__row-icon {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.sf-view__row-name {
  font-weight: 500;
  flex-shrink: 0;
}

.sf-view__row-path {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
</style>
