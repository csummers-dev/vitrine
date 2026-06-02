<template>
  <SettingsPage
    title="Audit log"
    icon="scroll-text"
    accent="var(--c-rose)"
    description="A chronological record of file operations, shares, sign-ins, and settings changes across the server. Newest first."
  >
    <!-- ── Filters ──────────────────────────────────────────────────── -->
    <div class="audit-filters">
      <label class="audit-filter">
        <span>Action</span>
        <select
          v-model="filters.action"
          class="settings-select"
          @change="reload"
        >
          <option
            v-for="opt in actionOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </label>

      <label class="audit-filter">
        <span>User</span>
        <select
          v-model="filters.userId"
          class="settings-select"
          @change="reload"
        >
          <option value="">All users</option>
          <option v-for="u in userOptions" :key="u.id" :value="u.id">
            {{ u.name }}
          </option>
        </select>
      </label>

      <label class="audit-filter">
        <span>From</span>
        <input
          v-model="filters.since"
          type="date"
          class="settings-input"
          @change="reload"
        />
      </label>

      <label class="audit-filter">
        <span>To</span>
        <input
          v-model="filters.until"
          type="date"
          class="settings-input"
          @change="reload"
        />
      </label>

      <label class="audit-filter audit-filter--grow">
        <span>Path</span>
        <input
          v-model.trim="filters.pathPrefix"
          type="text"
          class="settings-input"
          placeholder="Filter by path prefix…"
          @input="onPathInput"
        />
      </label>

      <button
        v-if="hasActiveFilters"
        type="button"
        class="audit-clear"
        @click="clearFilters"
      >
        <Icon name="x" :size="13" />
        Clear
      </button>
    </div>

    <!-- ── Body ─────────────────────────────────────────────────────── -->
    <div v-if="loading" class="audit-state">
      <Icon name="loader-circle" :size="20" class="audit-spin" />
    </div>

    <EmptyState
      v-else-if="error"
      icon="circle-alert"
      title="Couldn't load the audit log"
      :hint="error"
      tone="danger"
    >
      <button type="button" class="audit-retry" @click="reload">
        <Icon name="rotate-ccw" :size="13" />
        Try again
      </button>
    </EmptyState>

    <EmptyState
      v-else-if="entries.length === 0"
      icon="scroll-text"
      title="No matching events"
      :hint="
        hasActiveFilters
          ? 'No audit entries match these filters.'
          : 'Nothing has been recorded yet — actions will appear here as they happen.'
      "
    />

    <template v-else>
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th class="audit-col-time">Time</th>
              <th class="audit-col-user">User</th>
              <th class="audit-col-action">Action</th>
              <th class="audit-col-path">Path</th>
              <th class="audit-col-ip">IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in entries" :key="`${e.timestamp}-${e.seq}-${i}`">
              <td class="audit-col-time tabular" :title="e.timestamp">
                {{ formatTime(e.timestamp) }}
              </td>
              <td class="audit-col-user">{{ userName(e.userId) }}</td>
              <td class="audit-col-action">
                <span class="audit-action-chip">{{
                  actionLabel(e.action)
                }}</span>
              </td>
              <td class="audit-col-path" :title="e.path">
                {{ e.path || "—" }}
              </td>
              <td class="audit-col-ip tabular">{{ e.ip || "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Pager ──────────────────────────────────────────────────── -->
      <div class="audit-pager">
        <span class="audit-pager__range">
          {{ rangeStart }}–{{ rangeEnd }} of {{ total }}
        </span>
        <div class="audit-pager__btns">
          <button
            type="button"
            class="audit-pager__btn"
            :disabled="offset === 0"
            @click="prevPage"
          >
            <Icon name="chevron-left" :size="14" />
            Previous
          </button>
          <button
            type="button"
            class="audit-pager__btn"
            :disabled="offset + pageSize >= total"
            @click="nextPage"
          >
            Next
            <Icon name="chevron-right" :size="14" />
          </button>
        </div>
      </div>
    </template>
  </SettingsPage>
</template>

<script setup lang="ts">
/**
 * Settings → Audit (v1.3 S8-1). Admin-only read view over the S1-5 audit
 * log via GET /api/audit. Filter by action / user / date range / path;
 * newest-first; offset paged.
 */
import { computed, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { audit as auditApi } from "@/api";
import type { AuditEntry } from "@/api/audit";
import SettingsPage from "@/components/settings/SettingsPage.vue";
import EmptyState from "@/components/EmptyState.vue";
import Icon from "@/components/Icon.vue";

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "file.created", label: "Created" },
  { value: "file.renamed", label: "Renamed" },
  { value: "file.moved", label: "Moved" },
  { value: "file.copied", label: "Copied" },
  { value: "file.deleted", label: "Deleted" },
  { value: "file.uploaded", label: "Uploaded" },
  { value: "share.granted", label: "Share granted" },
  { value: "share.revoked", label: "Share revoked" },
  { value: "user.loggedIn", label: "Signed in" },
  { value: "user.loggedOut", label: "Signed out" },
  { value: "settings.changed", label: "Settings changed" },
];
const actionOptions = ACTION_OPTIONS;
const actionLabelMap = new Map(ACTION_OPTIONS.map((o) => [o.value, o.label]));
const actionLabel = (a: string) => actionLabelMap.get(a) ?? a;

const pageSize = 50;

const filters = reactive({
  action: "",
  userId: "" as string,
  since: "",
  until: "",
  pathPrefix: "",
});

const entries = ref<AuditEntry[]>([]);
const total = ref(0);
const users = ref<Record<number, string>>({});
const offset = ref(0);
const loading = ref(false);
const error = ref<string>("");

let pathDebounce: ReturnType<typeof setTimeout> | null = null;

const userOptions = computed(() =>
  Object.entries(users.value)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
);

const hasActiveFilters = computed(
  () =>
    !!filters.action ||
    !!filters.userId ||
    !!filters.since ||
    !!filters.until ||
    !!filters.pathPrefix
);

const rangeStart = computed(() => (total.value === 0 ? 0 : offset.value + 1));
const rangeEnd = computed(() => Math.min(offset.value + pageSize, total.value));

const userName = (id: number) => {
  if (!id) return "system";
  return users.value[id] ?? `#${id}`;
};

const formatTime = (ts: string) => dayjs(ts).format("MMM D, YYYY HH:mm:ss");

/** Build a To-bound that includes the selected day (Filter.Until is
 *  exclusive, so send the start of the NEXT day). */
const untilBound = (d: string) =>
  d ? dayjs(d).add(1, "day").format("YYYY-MM-DD") : undefined;

const load = async () => {
  loading.value = true;
  error.value = "";
  try {
    const res = await auditApi.get({
      action: filters.action || undefined,
      userId: filters.userId ? Number(filters.userId) : undefined,
      since: filters.since || undefined,
      until: untilBound(filters.until),
      pathPrefix: filters.pathPrefix || undefined,
      limit: pageSize,
      offset: offset.value,
    });
    entries.value = res.entries;
    total.value = res.total;
    // Keep the (server-built) user map fresh — it's the authoritative
    // id→name source for both the table and the filter dropdown.
    if (res.users) users.value = res.users;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Request failed.";
    entries.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

/** Filter change → back to page 1 + reload. */
const reload = () => {
  offset.value = 0;
  void load();
};

const onPathInput = () => {
  if (pathDebounce) clearTimeout(pathDebounce);
  pathDebounce = setTimeout(reload, 300);
};

const clearFilters = () => {
  filters.action = "";
  filters.userId = "";
  filters.since = "";
  filters.until = "";
  filters.pathPrefix = "";
  reload();
};

const prevPage = () => {
  offset.value = Math.max(0, offset.value - pageSize);
  void load();
};
const nextPage = () => {
  if (offset.value + pageSize < total.value) {
    offset.value += pageSize;
    void load();
  }
};

onMounted(load);
</script>

<style scoped>
.audit-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}

.audit-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.audit-filter > span {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-3, #a1a1aa);
}
.audit-filter--grow {
  flex: 1;
  min-width: 160px;
}

.audit-clear {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}
.audit-clear:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.audit-state {
  display: flex;
  justify-content: center;
  padding: 40px 0;
  color: var(--color-ink-3, #a1a1aa);
}
.audit-spin {
  animation: audit-spin 0.9s linear infinite;
}
@keyframes audit-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .audit-spin {
    animation: none;
  }
}

.audit-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
}
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.audit-table thead th {
  position: sticky;
  top: 0;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-3, #a1a1aa);
  background: var(--color-canvas, #fafaf9);
  padding: 9px 12px;
  border-bottom: 1px solid var(--color-line, #ececec);
  white-space: nowrap;
}
.audit-table tbody td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-1, #18181b);
  vertical-align: top;
}
.audit-table tbody tr:last-child td {
  border-bottom: 0;
}
.audit-table tbody tr:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
}

.tabular {
  font-variant-numeric: tabular-nums;
}

.audit-col-time {
  white-space: nowrap;
  color: var(--color-ink-2, #52525b);
}
.audit-col-user {
  white-space: nowrap;
}
.audit-col-path {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-ink-2, #52525b);
}
.audit-col-ip {
  white-space: nowrap;
  color: var(--color-ink-3, #a1a1aa);
}

.audit-action-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
  white-space: nowrap;
}

.audit-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}
.audit-pager__range {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
}
.audit-pager__btns {
  display: flex;
  gap: 8px;
}
.audit-pager__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}
.audit-pager__btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.audit-pager__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.audit-retry {
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
}
.audit-retry:hover {
  border-color: var(--color-accent, #5e6ad2);
  color: var(--color-accent, #5e6ad2);
}
</style>
