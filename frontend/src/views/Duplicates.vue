<template>
  <!-- Duplicate finder (4.0 Phase 5.2). -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <div class="dupes-hero">
        <div class="min-w-0 flex-1">
          <div
            class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] mb-1"
          >
            Library tools
          </div>
          <h1
            class="text-[22px] font-semibold leading-tight text-ink-1 max-md:text-[18px]"
          >
            Duplicates
          </h1>
          <div
            class="mt-1 text-[13px] text-ink-3 tabular"
            data-testid="dupes-summary"
          >
            <template v-if="!scan">Find files with identical content.</template>
            <template v-else-if="running">{{ progressText }}</template>
            <template v-else-if="scan.status === 'failed'"
              >The scan failed: {{ scan.error }}</template
            >
            <template v-else-if="scan.status === 'canceled'"
              >The scan was canceled.</template
            >
            <template v-else-if="groups.length === 0"
              >No duplicates in {{ folderName(scan.path) }} ({{
                (scan.result?.filesSeen ?? 0).toLocaleString()
              }}
              files checked).</template
            >
            <template v-else>
              {{ groups.length.toLocaleString() }}
              {{ groups.length === 1 ? "group" : "groups" }} in
              {{ folderName(scan.path) }} · {{ humanSize(reclaimable) }} can be
              freed
            </template>
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 pb-8 max-md:px-3">
        <!-- Scan settings -->
        <form class="dupes-form" @submit.prevent="start">
          <label class="dupes-field">
            <span>Folder</span>
            <input
              v-model="form.path"
              type="text"
              spellcheck="false"
              autocomplete="off"
              :disabled="running"
            />
          </label>
          <label class="dupes-field dupes-field--narrow">
            <span>Smallest file</span>
            <select v-model.number="form.minSize" :disabled="running">
              <option v-for="o in MIN_SIZES" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
          </label>
          <label class="dupes-field dupes-field--wide">
            <span>Skip folders (one per line)</span>
            <textarea
              v-model="form.exclude"
              rows="2"
              spellcheck="false"
              placeholder="/Backups/old"
              :disabled="running"
            />
          </label>
          <label class="dupes-check">
            <input
              v-model="form.includeHidden"
              type="checkbox"
              :disabled="running"
            />
            <span>Include hidden files</span>
          </label>
          <div class="dupes-form__actions">
            <button
              v-if="running"
              type="button"
              class="dupes-btn"
              @click="cancel"
            >
              Cancel scan
            </button>
            <button v-else type="submit" class="dupes-btn dupes-btn--primary">
              <Icon name="search" :size="14" />
              {{ scan ? "Scan again" : "Find duplicates" }}
            </button>
          </div>
          <div
            v-if="running"
            class="dupes-progress"
            role="progressbar"
            :aria-valuenow="progressPct ?? undefined"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="progressText"
          >
            <span
              class="dupes-progress__bar"
              :class="{ 'is-indeterminate': progressPct === null }"
              :style="
                progressPct === null ? undefined : { width: `${progressPct}%` }
              "
            />
          </div>
        </form>

        <!-- Results -->
        <template v-if="groups.length > 0">
          <div class="dupes-toolbar" role="toolbar" aria-label="Selection">
            <span class="dupes-toolbar__label">Select all but</span>
            <button type="button" class="dupes-chip" @click="apply('newest')">
              the newest
            </button>
            <button type="button" class="dupes-chip" @click="apply('oldest')">
              the oldest
            </button>
            <span class="dupes-toolbar__label">or keep copies in</span>
            <input
              v-model="keepFolder"
              class="dupes-chip-input"
              type="text"
              placeholder="/Music"
              aria-label="Folder to keep copies in"
              @keydown.enter.prevent="apply('folder')"
            />
            <button
              type="button"
              class="dupes-chip"
              :disabled="!keepFolder.trim()"
              @click="apply('folder')"
            >
              Apply
            </button>
            <button
              v-if="selected.size > 0"
              type="button"
              class="dupes-chip"
              @click="selected = new Set()"
            >
              Clear
            </button>
            <span class="flex-1" />
            <button
              v-if="canDelete"
              type="button"
              class="dupes-btn dupes-btn--danger"
              :disabled="selected.size === 0 || deleting"
              data-testid="dupes-trash"
              @click="confirmOpen = true"
            >
              <Icon name="trash-2" :size="14" />
              <template v-if="selected.size === 0">Move to trash</template>
              <template v-else>
                Move {{ selected.size }} to trash ·
                {{ humanSize(selectedSize) }}
              </template>
            </button>
          </div>

          <ul class="dupes-groups" data-testid="dupes-groups">
            <li v-for="g in shownGroups" :key="g.hash" class="dupes-group">
              <div class="dupes-group__head">
                <span class="dupes-group__size">{{ humanSize(g.size) }}</span>
                × {{ g.files.length }} copies
                <span class="dupes-dot">·</span>
                frees {{ humanSize(g.size * (g.files.length - 1)) }}
              </div>
              <ul class="dupes-files">
                <li v-for="f in g.files" :key="f.path" class="dupes-file">
                  <label
                    class="dupes-file__pick"
                    :title="
                      canSelect(g, selected, f.path)
                        ? ''
                        : 'Keep at least one copy'
                    "
                  >
                    <input
                      type="checkbox"
                      :checked="selected.has(f.path)"
                      :disabled="!canDelete || !canSelect(g, selected, f.path)"
                      :aria-label="`Delete ${f.path}`"
                      @change="toggle(g, f.path)"
                    />
                    <span class="dupes-file__text">
                      <span class="dupes-file__name">{{ f.name }}</span>
                      <span class="dupes-file__dir">{{ dirOf(f.path) }}</span>
                    </span>
                  </label>
                  <span class="dupes-file__date" :title="f.modified">{{
                    since(f.modified)
                  }}</span>
                  <button
                    type="button"
                    class="dupes-file__show"
                    :aria-label="`Show ${f.path} in files`"
                    @click="reveal(f.path)"
                  >
                    Show
                  </button>
                </li>
              </ul>
            </li>
          </ul>
          <button
            v-if="shownGroups.length < groups.length"
            type="button"
            class="dupes-more"
            @click="limit += 200"
          >
            Show {{ Math.min(200, groups.length - shownGroups.length) }} more
            groups
          </button>
        </template>

        <EmptyState
          v-else-if="!scan"
          icon="copy"
          title="Find duplicate files"
          message="Pick a folder and start a scan. Files are compared by content, not name; only files that share a size are read, so big libraries scan quickly. Anything you delete goes to the trash."
        />
      </div>

      <ConfirmDialog
        :open="confirmOpen"
        :title="`Move ${selected.size} ${selected.size === 1 ? 'file' : 'files'} to the trash?`"
        :message="`This frees ${humanSize(selectedSize)}. Every group keeps at least one copy, and you can restore from the trash.`"
        confirm-label="Move to trash"
        cancel-label="Cancel"
        destructive
        @confirm="trashSelected"
        @cancel="confirmOpen = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Icon from "@/components/Icon.vue";
import EmptyState from "@/components/EmptyState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { files as filesApi } from "@/api";
import {
  getScan,
  startScan,
  stopScan,
  type DupeGroup,
  type DupeScan,
} from "@/api/dupes";
import {
  autoSelect,
  canSelect,
  keepKnown,
  selectedBytes,
  toggleCopy,
  type KeepRule,
} from "@/utils/dupeSelection";
import { encodePath } from "@/utils/url";
import { filesize } from "@/utils";
import { timeAgo } from "@/utils/relativeTime";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useRootLabel } from "@/composables/useRootLabel";

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const fileStore = useFileStore();
const { rootLabel } = useRootLabel();

const canDelete = computed(() => !!authStore.user?.perm.delete);

const MIN_SIZES = [
  { label: "Any size", value: 1 },
  { label: "100 KB", value: 100 * 1024 },
  { label: "1 MB", value: 1024 ** 2 },
  { label: "10 MB", value: 10 * 1024 ** 2 },
  { label: "100 MB", value: 100 * 1024 ** 2 },
];

const form = ref({
  path: typeof route.query.path === "string" ? route.query.path : "/",
  minSize: 1024 ** 2,
  includeHidden: false,
  exclude: "",
});

const scan = ref<DupeScan | null>(null);
const selected = ref(new Set<string>());
const keepFolder = ref("");
const limit = ref(200);
const deleting = ref(false);
const confirmOpen = ref(false);

const running = computed(
  () => scan.value?.status === "queued" || scan.value?.status === "running"
);
const groups = computed<DupeGroup[]>(() =>
  scan.value?.status === "done" ? (scan.value.result?.groups ?? []) : []
);
const shownGroups = computed(() => groups.value.slice(0, limit.value));
const reclaimable = computed(() => scan.value?.result?.reclaimable ?? 0);
const selectedSize = computed(() =>
  selectedBytes(groups.value, selected.value)
);

const humanSize = (n: number) => filesize(n);
const since = (ts: string) => timeAgo(ts);
const rootName = computed(() => rootLabel.value || t("sidebar.myFiles"));
const folderName = (p: string) =>
  p === "/" ? rootName.value : p.slice(p.lastIndexOf("/") + 1);
const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || rootName.value;

const progressPct = computed<number | null>(() => {
  const p = scan.value?.progress;
  if (!p || p.phase !== "hashing" || p.candidates === 0) return null;
  return Math.round((p.hashed / p.candidates) * 100);
});
const progressText = computed(() => {
  const s = scan.value;
  if (!s) return "";
  if (s.status === "queued") return "Waiting for another scan to finish…";
  const p = s.progress;
  if (p.phase === "listing")
    return `Listing files… ${p.filesSeen.toLocaleString()} so far`;
  return `Comparing ${p.candidates.toLocaleString()} files that share a size… ${progressPct.value ?? 0}% (${humanSize(p.bytesRead)} read)`;
});

// ── Polling ───────────────────────────────────────────────────────────
let timer: ReturnType<typeof setTimeout> | null = null;
const POLL_MS = 700;

const refresh = async () => {
  try {
    const s = await getScan();
    scan.value = s;
    selected.value = keepKnown(groups.value, selected.value);
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
  schedule();
};

const schedule = () => {
  if (timer) clearTimeout(timer);
  timer = running.value ? setTimeout(() => void refresh(), POLL_MS) : null;
};

onMounted(async () => {
  await refresh();
  const s = scan.value;
  // Pick up the last scan's settings unless a folder was asked for.
  if (s && typeof route.query.path !== "string") {
    form.value = {
      path: s.options.path,
      minSize: s.options.minSize,
      includeHidden: s.options.includeHidden,
      exclude: (s.options.exclude ?? []).join("\n"),
    };
  }
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

const start = async () => {
  try {
    selected.value = new Set();
    limit.value = 200;
    scan.value = await startScan({
      path: form.value.path.trim() || "/",
      minSize: form.value.minSize,
      includeHidden: form.value.includeHidden,
      exclude: form.value.exclude
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    });
    schedule();
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
};

const cancel = async () => {
  try {
    await stopScan();
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
  scan.value = null;
  schedule();
};

// ── Selection ─────────────────────────────────────────────────────────
const apply = (rule: KeepRule) => {
  selected.value = autoSelect(groups.value, rule, keepFolder.value.trim());
};
const toggle = (g: DupeGroup, path: string) => {
  const next = toggleCopy(g, selected.value, path);
  if (next) selected.value = next;
};

const reveal = (path: string) => {
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  fileStore.setPreselect(path);
  void router.push(`/files${dir === "/" ? "" : encodePath(dir)}/`);
};

const trashSelected = async () => {
  confirmOpen.value = false;
  deleting.value = true;
  const paths = [...selected.value];
  const failed: string[] = [];
  let freed = 0;
  const sizeOf = new Map(
    groups.value.flatMap((g) => g.files.map((f) => [f.path, g.size] as const))
  );
  // A few at a time: each delete is a move into the trash.
  for (let i = 0; i < paths.length; i += 4) {
    await Promise.all(
      paths.slice(i, i + 4).map(async (p) => {
        try {
          await filesApi.remove(`/files${encodePath(p)}`);
          freed += sizeOf.get(p) ?? 0;
        } catch {
          failed.push(p);
        }
      })
    );
  }
  deleting.value = false;
  if (failed.length > 0) {
    $showError(
      new Error(
        `${failed.length} ${failed.length === 1 ? "file" : "files"} couldn't be moved to the trash.`
      )
    );
  }
  if (freed > 0) $showSuccess(`Moved to the trash · ${humanSize(freed)} freed`);
  await refresh();
};
</script>

<style scoped>
.dupes-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
}
@media (max-width: 768px) {
  .dupes-hero {
    padding: 12px 16px 10px;
  }
}
.dupes-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 14px;
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-canvas, #fafaf9);
}
.dupes-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-2, #52525b);
  flex: 1 1 220px;
}
.dupes-field--narrow {
  flex: 0 0 140px;
}
.dupes-field--wide {
  flex: 1 1 260px;
}
.dupes-field input,
.dupes-field select,
.dupes-field textarea,
.dupes-chip-input {
  font: inherit;
  font-weight: 400;
  font-size: 13px;
  padding: 6px 9px;
  border-radius: 7px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
}
.dupes-field textarea {
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.dupes-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  padding-bottom: 7px;
}
.dupes-form__actions {
  margin-left: auto;
}
.dupes-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 13px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font-size: 13px;
  font-weight: 600;
}
.dupes-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dupes-btn--primary {
  background: var(--color-accent, #6e72d9);
  border-color: transparent;
  color: #fff;
}
.dupes-btn--danger {
  border-color: color-mix(in srgb, var(--c-rose) 30%, transparent);
  background: color-mix(in srgb, var(--c-rose) 8%, transparent);
  color: var(--c-rose);
}
.dupes-progress {
  flex-basis: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--color-line, #ececec);
  overflow: hidden;
}
.dupes-progress__bar {
  display: block;
  height: 100%;
  background: var(--color-accent, #6e72d9);
  transition: width 0.3s ease;
}
.dupes-progress__bar.is-indeterminate {
  width: 30%;
  animation: dupes-slide 1.2s ease-in-out infinite;
}
@keyframes dupes-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(340%);
  }
}
.dupes-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.dupes-toolbar__label {
  font-size: 12.5px;
  color: var(--color-ink-3, #82828c);
}
.dupes-chip {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
}
.dupes-chip:hover:not(:disabled) {
  border-color: var(--color-accent, #6e72d9);
  color: var(--color-ink-1, #18181b);
}
.dupes-chip:disabled {
  opacity: 0.5;
}
.dupes-chip-input {
  width: 140px;
  padding: 3px 9px;
  font-size: 12.5px;
  border-radius: 999px;
}
.dupes-groups {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dupes-group {
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  overflow: hidden;
}
.dupes-group__head {
  padding: 7px 12px;
  font-size: 12.5px;
  color: var(--color-ink-3, #82828c);
  background: var(--color-canvas, #fafaf9);
  border-bottom: 1px solid var(--color-line, #ececec);
}
.dupes-group__size {
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}
.dupes-dot {
  margin: 0 4px;
  opacity: 0.55;
}
.dupes-files {
  list-style: none;
  margin: 0;
  padding: 0;
}
.dupes-file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
}
.dupes-file + .dupes-file {
  border-top: 1px solid var(--color-line, #ececec);
}
.dupes-file__pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.dupes-file__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dupes-file__name {
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dupes-file__dir {
  font-size: 11.5px;
  color: var(--color-ink-3, #82828c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dupes-file__date {
  flex: none;
  font-size: 12px;
  color: var(--color-ink-3, #82828c);
}
.dupes-file__show {
  flex: none;
  font-size: 12px;
  color: var(--color-accent, #6e72d9);
  padding: 2px 6px;
  border-radius: 6px;
}
.dupes-file__show:hover {
  background: var(--color-elevated, #f4f4f5);
}
.dupes-more {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-accent, #6e72d9);
}
</style>
