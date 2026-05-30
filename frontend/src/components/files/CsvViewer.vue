<template>
  <div class="csv-viewer">
    <div class="csv-header">
      <div class="header-select">
        <label for="columnSeparator">{{ $t("files.columnSeparator") }}</label>
        <select
          id="columnSeparator"
          class="fb-select"
          v-model="columnSeparator"
        >
          <option :value="[',']">
            {{ $t("files.csvSeparators.comma") }}
          </option>
          <option :value="[';']">
            {{ $t("files.csvSeparators.semicolon") }}
          </option>
          <option :value="[',', ';']">
            {{ $t("files.csvSeparators.both") }}
          </option>
        </select>
      </div>
      <div class="header-select" v-if="isEncodedContent">
        <label for="fileEncoding">{{ $t("files.fileEncoding") }}</label>
        <DropdownModal
          v-model="isEncondingDropdownOpen"
          :close-on-click="false"
        >
          <div>
            <span class="selected-encoding">{{ selectedEncoding }}</span>
          </div>
          <template v-slot:list>
            <input
              v-model="encodingSearch"
              :placeholder="$t('search.search')"
              class="fb-input"
              name="encoding"
            />
            <div class="encoding-list">
              <EmptyState
                v-if="encodingList.length == 0"
                icon="search-x"
                title="No matches"
                compact
              />
              <button
                v-for="encoding in encodingList"
                :value="encoding"
                :key="encoding"
                class="encoding-button"
                @click="selectedEncoding = encoding"
              >
                {{ encoding }}
              </button>
            </div>
          </template>
        </DropdownModal>
      </div>
    </div>
    <div v-if="displayError" class="csv-error">
      <Icon name="circle-alert" />
      <p>{{ displayError }}</p>
    </div>
    <div v-else-if="parsed.headers.length === 0" class="csv-empty">
      <Icon name="file-text" />
      <p>{{ $t("files.lonely") }}</p>
    </div>
    <div v-else class="csv-table-container" @wheel.stop @touchmove.stop>
      <table class="csv-table">
        <thead>
          <tr>
            <th v-for="(header, index) in parsed.headers" :key="index">
              {{ header || `Column ${index + 1}` }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in parsed.rows" :key="rowIndex">
            <td v-for="(cell, cellIndex) in row" :key="cellIndex">
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="csv-footer">
        <div class="csv-info" v-if="parsed.rows.length > 100">
          <Icon name="info" />
          <span>
            {{ $t("files.showingRows", { count: parsed.rows.length }) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import EmptyState from "@/components/EmptyState.vue";
import { computed, ref, watch, watchEffect } from "vue";
import { parse } from "csv-parse/browser/esm";
import { useI18n } from "vue-i18n";
import { availableEncodings, decode } from "@/utils/encodings";
import DropdownModal from "../DropdownModal.vue";

const { t } = useI18n({});

interface Props {
  content: ArrayBuffer | string;
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  error: "",
});

const isEncondingDropdownOpen = ref(false);

const encodingSearch = ref<string>("");

const encodingList = computed(() => {
  return availableEncodings.filter((e) =>
    e.toLowerCase().includes(encodingSearch.value.toLowerCase())
  );
});

const columnSeparator = ref([",", ";"]);

const selectedEncoding = ref("utf-8");

const parsed = ref<CsvData>({ headers: [], rows: [] });

const displayError = ref<string | null>(null);

const isEncodedContent = computed(() => {
  return props.content instanceof ArrayBuffer;
});

/**
 * Pad headers and rows so every row has the same column count.
 *
 * With `relax_column_count: true` the parser returns short rows as
 * shorter arrays and long rows as longer ones, which makes the
 * `<table>` render with missing trailing cells (no border, no
 * background) and unlabeled extra columns. We normalize to the
 * widest row so the grid stays uniform — the `<th>` template
 * already falls back to "Column N" when a header cell is empty.
 */
const normalizeShape = (
  rawHeaders: string[] | undefined,
  rawRows: string[][]
): CsvData => {
  const headers = rawHeaders ?? [];
  const maxCols = rawRows.reduce(
    (max, row) => Math.max(max, row.length),
    headers.length
  );
  const padded = (row: string[]): string[] => {
    if (row.length === maxCols) return row;
    const out = row.slice();
    while (out.length < maxCols) out.push("");
    return out;
  };
  return {
    headers: padded(headers),
    rows: rawRows.map(padded),
  };
};

watchEffect(() => {
  if (props.content !== "" && columnSeparator.value.length > 0) {
    const content = isEncodedContent.value
      ? decode(props.content as ArrayBuffer, selectedEncoding.value)
      : props.content;
    parse(
      content as string,
      {
        delimiter: columnSeparator.value,
        skip_empty_lines: true,
        // Tolerate rows with inconsistent column counts (PR #5965).
        // csv-parse defaults to erroring on any mismatch — for a file
        // browser preview that's hostile UX. With this flag short rows
        // come back as shorter arrays and long rows as longer ones; we
        // then normalize to a uniform grid below so the table still
        // looks like a table.
        relax_column_count: true,
      },
      (error, output) => {
        if (error) {
          console.error("Failed to parse CSV:", error);
          parsed.value = { headers: [], rows: [] };
          displayError.value = t("files.csvLoadFailed", {
            error: error.toString(),
          });
        } else {
          parsed.value = normalizeShape(output[0], output.slice(1));
          displayError.value = null;
        }
      }
    );
  }
});

watch(selectedEncoding, () => {
  isEncondingDropdownOpen.value = false;
  encodingSearch.value = "";
});
</script>

<style scoped>
.csv-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--surfacePrimary);
  color: var(--textSecondary);
  padding: 1rem;
  padding-top: 4em;
  box-sizing: border-box;
}

.csv-error,
.csv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  padding: 24px;
  color: var(--color-ink-2, #52525b);
  text-align: center;
}

.csv-error :deep(svg),
.csv-empty :deep(svg) {
  width: 28px;
  height: 28px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
  box-sizing: content-box;
}

.csv-error p,
.csv-empty p {
  font-size: 13px;
  margin: 0;
  max-width: 320px;
  line-height: 1.45;
}

.csv-table-container {
  flex: 1;
  overflow: auto;
  background-color: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
}

/* Scrollbar styling for better visibility */
.csv-table-container::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.csv-table-container::-webkit-scrollbar-track {
  background: var(--background);
  border-radius: 4px;
}

.csv-table-container::-webkit-scrollbar-thumb {
  background: var(--borderSecondary);
  border-radius: 4px;
}

.csv-table-container::-webkit-scrollbar-thumb:hover {
  background: var(--textPrimary);
}

.csv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  background-color: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
}

.csv-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--color-canvas, #fafaf9);
}

.csv-table th {
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  border-bottom: 1px solid var(--color-line, #ececec);
  background-color: var(--color-canvas, #fafaf9);
  white-space: nowrap;
}

.csv-table td {
  padding: 8px 14px;
  text-align: left;
  border-bottom: 1px solid var(--color-line, #ececec);
  white-space: nowrap;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-ink-1, #18181b);
  font-variant-numeric: tabular-nums;
}

.csv-table tbody tr:nth-child(even) {
  background-color: var(--color-canvas, #fafaf9);
}

.csv-table tbody tr:hover {
  background-color: var(--color-hover, rgba(24, 24, 27, 0.045));
  transition: background-color 0.12s ease;
}

.csv-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
}

.csv-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
  font-size: 11.5px;
  font-weight: 500;
}

.csv-info :deep(svg) {
  width: 12px;
  height: 12px;
}

.csv-header {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem;
}

.header-select {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-direction: column;
  @media (width >= 640px) {
    flex-direction: row;
  }
}

.header-select > label {
  font-size: small;
  @media (width >= 640px) {
    max-width: 70px;
  }
}

.header-select > select,
.header-select > div {
  margin-bottom: 0;
}

.csv-info i {
  font-size: 1.2rem;
  color: var(--blue);
}

.encoding-list {
  max-height: 300px;
  min-width: 120px;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

.encoding-button {
  background-color: transparent;
  border: none;
  outline: none;
  padding: 6px 10px;
  color: var(--color-ink-1, #18181b);
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  display: block;
  width: 100%;
  font-size: 12.5px;
  font-family: inherit;
}

.encoding-button:hover {
  background-color: var(--color-elevated, #f4f4f5);
}

.selected-encoding {
  white-space: nowrap;
  text-overflow: ellipsis;
}

.message {
  font-size: 1.25em;
}
</style>
