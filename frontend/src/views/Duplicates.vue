<template>
  <!-- Duplicate finder (4.0 Phase 5.2). -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <UiPageHeader
        eyebrow="Library tools"
        title="Duplicates"
        :meta-attrs="{ 'data-testid': 'dupes-summary' }"
      >
        <template #meta>
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
        </template>
      </UiPageHeader>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 pb-8 max-md:px-3">
        <!-- Scan settings -->
        <form class="dupes-form" @submit.prevent="start">
          <UiTextField
            v-model="form.path"
            class="dupes-form__path"
            label="Folder"
            mono
            spellcheck="false"
            autocomplete="off"
            :disabled="running"
          />
          <UiSelect
            v-model="form.minSize"
            class="dupes-form__size"
            label="Smallest file"
            :options="MIN_SIZES"
            :disabled="running"
          />
          <UiTextField
            v-model="form.exclude"
            class="dupes-form__exclude"
            label="Skip folders (one per line)"
            mono
            :rows="2"
            spellcheck="false"
            placeholder="/Backups/old"
            :disabled="running"
          />
          <UiCheckbox
            v-model="form.includeHidden"
            label="Include hidden files"
            :disabled="running"
          />
          <div class="dupes-form__actions">
            <UiButton v-if="running" @click="cancel">Cancel scan</UiButton>
            <UiButton v-else type="submit" variant="primary" icon="search">
              {{ scan ? "Scan again" : "Find duplicates" }}
            </UiButton>
          </div>
          <UiProgress
            v-if="running"
            class="dupes-form__progress"
            :value="progressPct ?? undefined"
            :label="progressText"
          />
        </form>

        <!-- Results -->
        <template v-if="groups.length > 0">
          <div class="dupes-toolbar" role="toolbar" aria-label="Selection">
            <span class="dupes-toolbar__label">Select all but</span>
            <UiButton size="sm" @click="apply('newest')">the newest</UiButton>
            <UiButton size="sm" @click="apply('oldest')">the oldest</UiButton>
            <span class="dupes-toolbar__label">or keep copies in</span>
            <UiTextField
              v-model="keepFolder"
              class="dupes-toolbar__folder"
              aria-label="Folder to keep copies in"
              placeholder="/Music"
              mono
              @keydown.enter.prevent="apply('folder')"
            />
            <UiButton
              size="sm"
              :disabled="!keepFolder.trim()"
              @click="apply('folder')"
              >Apply</UiButton
            >
            <UiButton
              v-if="selected.size > 0"
              size="sm"
              variant="ghost"
              @click="selected = new Set()"
              >Clear</UiButton
            >
            <span class="flex-1" />
            <UiButton
              v-if="canDelete"
              variant="danger"
              icon="trash-2"
              :disabled="selected.size === 0"
              disabled-reason="Select the copies to remove first"
              :loading="deleting"
              data-testid="dupes-trash"
              @click="confirmOpen = true"
            >
              <template v-if="selected.size === 0">Move to trash</template>
              <template v-else>
                Move {{ selected.size }} to trash ·
                {{ humanSize(selectedSize) }}
              </template>
            </UiButton>
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
                  <UiCheckbox
                    class="dupes-file__pick"
                    :model-value="selected.has(f.path)"
                    :disabled="!canDelete || !canSelect(g, selected, f.path)"
                    :aria-label="`Delete ${f.path}`"
                    :title="
                      canSelect(g, selected, f.path)
                        ? ''
                        : 'Keep at least one copy'
                    "
                    @update:model-value="toggle(g, f.path)"
                  >
                    <span class="dupes-file__text">
                      <span class="dupes-file__name">{{ f.name }}</span>
                      <span class="dupes-file__dir">{{ dirOf(f.path) }}</span>
                    </span>
                  </UiCheckbox>
                  <span class="dupes-file__date" :title="f.modified">{{
                    since(f.modified)
                  }}</span>
                  <UiButton
                    size="sm"
                    variant="ghost"
                    :aria-label="`Show ${f.path} in files`"
                    @click="reveal(f.path)"
                    >Show</UiButton
                  >
                </li>
              </ul>
            </li>
          </ul>
          <UiButton
            v-if="shownGroups.length < groups.length"
            class="dupes-more"
            @click="limit += 200"
          >
            Show {{ Math.min(200, groups.length - shownGroups.length) }} more
            groups
          </UiButton>
        </template>

        <EmptyState
          v-else-if="!scan"
          icon="copy"
          title="Find duplicate files"
          hint="Pick a folder and start a scan. Files are compared by content, not name; only files that share a size are read, so big libraries scan quickly. Anything you delete goes to the trash."
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
import EmptyState from "@/components/EmptyState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import UiPageHeader from "@/components/ui/UiPageHeader.vue";
import UiProgress from "@/components/ui/UiProgress.vue";
import UiSelect from "@/components/ui/UiSelect.vue";
import UiTextField from "@/components/ui/UiTextField.vue";
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
.dupes-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-panel);
}
.dupes-form__path {
  flex: 1 1 220px;
}
.dupes-form__size {
  flex: 0 0 150px;
}
.dupes-form__exclude {
  flex: 1 1 260px;
}
.dupes-form__actions {
  margin-left: auto;
}
.dupes-form__progress {
  flex-basis: 100%;
}
.dupes-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.dupes-toolbar__label {
  font-size: var(--type-body);
  color: var(--color-ink-3);
}
.dupes-toolbar__folder {
  width: 160px;
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
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.dupes-group__head {
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-body);
  color: var(--color-ink-3);
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-line);
}
.dupes-group__size {
  font-weight: 600;
  color: var(--color-ink-1);
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
  border-top: 1px solid var(--color-line);
}
.dupes-file__pick {
  flex: 1;
  min-width: 0;
}
.dupes-file__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dupes-file__name {
  font-size: var(--type-ui);
  color: var(--color-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dupes-file__dir {
  font-size: var(--type-caption);
  color: var(--color-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dupes-file__date {
  flex: none;
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
.dupes-more {
  margin-top: var(--space-3);
}
</style>
