<template>
  <SettingsPage
    title="Webhooks"
    description="POST a JSON payload to external URLs when files change — wire up Discord, n8n, Home Assistant, or your own service. Deliveries are server-wide and retried on failure."
  >
    <SettingsSection
      title="Endpoints"
      :description="`${endpoints.length} configured`"
    >
      <template #headerRight>
        <button
          type="button"
          class="wh-add-btn"
          :disabled="editor.open"
          @click="openNew"
        >
          <Icon name="plus" :size="14" />
          Add endpoint
        </button>
      </template>

      <!-- Editor (add / edit) -->
      <div v-if="editor.open" class="wh-editor">
        <label class="wh-field">
          <span>Payload URL</span>
          <input
            ref="urlInput"
            v-model.trim="editor.url"
            type="url"
            class="settings-input"
            placeholder="https://example.com/webhook"
            spellcheck="false"
            autocomplete="off"
          />
        </label>

        <div class="wh-field">
          <span>Events</span>
          <p class="wh-hint">
            Leave all unchecked to fire on every file event.
          </p>
          <div class="wh-events">
            <label v-for="ev in eventTypes" :key="ev" class="wh-event-check">
              <input
                type="checkbox"
                :checked="editor.events.has(ev)"
                @change="toggleEditorEvent(ev)"
              />
              <span>{{ eventLabel(ev) }}</span>
            </label>
          </div>
        </div>

        <label class="wh-toggle-row">
          <Toggle v-model="editor.enabled" />
          <span>Enabled</span>
        </label>

        <div class="wh-editor-actions">
          <button type="button" class="wh-btn" @click="cancelEdit">
            Cancel
          </button>
          <button
            type="button"
            class="wh-btn wh-btn--primary"
            :disabled="!validUrl(editor.url) || saving"
            @click="save"
          >
            {{ editor.id ? "Save changes" : "Create endpoint" }}
          </button>
        </div>
      </div>

      <!-- States -->
      <div v-if="loading" class="wh-state">
        <Icon name="loader-circle" :size="20" class="wh-spin" />
      </div>

      <EmptyState
        v-else-if="error"
        icon="circle-alert"
        title="Couldn't load webhooks"
        :hint="error"
        tone="danger"
      >
        <button type="button" class="wh-btn" @click="load">Try again</button>
      </EmptyState>

      <EmptyState
        v-else-if="endpoints.length === 0 && !editor.open"
        icon="webhook"
        title="No webhooks yet"
        hint="Add an endpoint to start receiving file-change notifications."
      />

      <!-- List -->
      <ul v-else class="wh-list">
        <li v-for="ep in endpoints" :key="ep.id" class="wh-row">
          <div class="wh-row__main">
            <div class="wh-row__url" :title="ep.url">{{ ep.url }}</div>
            <div class="wh-row__meta">
              <span class="wh-events-summary">{{
                eventsSummary(ep.events)
              }}</span>
              <span
                v-if="ep.lastStatus"
                class="wh-status"
                :class="`wh-status--${ep.lastStatus}`"
              >
                <Icon
                  :name="ep.lastStatus === 'success' ? 'check' : 'x'"
                  :size="11"
                  :stroke-width="3"
                />
                {{ ep.lastStatus === "success" ? "Delivered" : "Failed" }}
                <template v-if="ep.lastCode"> · {{ ep.lastCode }}</template>
                <template v-if="ep.lastAt">
                  · {{ relTime(ep.lastAt) }}</template
                >
              </span>
              <span v-else class="wh-status wh-status--idle"
                >No deliveries yet</span
              >
            </div>
          </div>

          <div class="wh-row__actions">
            <Toggle
              :model-value="ep.enabled"
              @update:model-value="(v: boolean) => toggleEnabled(ep, v)"
            />
            <button
              type="button"
              class="wh-icon-btn"
              :disabled="testingId === ep.id"
              title="Send test payload"
              aria-label="Send test payload"
              @click="runTest(ep)"
            >
              <Icon
                :name="testingId === ep.id ? 'loader-circle' : 'send'"
                :size="14"
                :class="{ 'wh-spin': testingId === ep.id }"
              />
            </button>
            <button
              type="button"
              class="wh-icon-btn"
              title="Edit"
              aria-label="Edit"
              @click="openEdit(ep)"
            >
              <Icon name="pencil" :size="14" />
            </button>
            <button
              type="button"
              class="wh-icon-btn wh-icon-btn--danger"
              title="Delete"
              aria-label="Delete"
              @click="askDelete(ep)"
            >
              <Icon name="trash-2" :size="14" />
            </button>
          </div>
        </li>
      </ul>
    </SettingsSection>

    <ConfirmDialog
      :open="deleteTarget !== null"
      title="Delete webhook?"
      :message="`Stop sending notifications to ${deleteTarget?.url ?? ''}? This can't be undone.`"
      confirm-label="Delete"
      cancel-label="Cancel"
      destructive
      @confirm="doDelete"
      @cancel="deleteTarget = null"
    />
  </SettingsPage>
</template>

<script setup lang="ts">
/**
 * Settings → Webhooks (v1.3 S8-2). Admin-only management of the
 * admin-global webhook endpoints: add/edit/delete, per-endpoint event
 * filter, quick enable toggle, last-delivery status, and a Test button.
 */
import { inject, nextTick, reactive, ref } from "vue";
import dayjs from "dayjs";
import { webhooks as api } from "@/api";
import type { WebhookEndpoint } from "@/api/webhooks";
import SettingsPage from "@/components/settings/SettingsPage.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import Toggle from "@/components/settings/Toggle.vue";
import EmptyState from "@/components/EmptyState.vue";
import Icon from "@/components/Icon.vue";

const $showSuccess = inject<IToastSuccess>("$showSuccess")!;
const $showError = inject<IToastError>("$showError")!;

const endpoints = ref<WebhookEndpoint[]>([]);
const eventTypes = ref<string[]>([]);
const loading = ref(false);
const error = ref("");
const saving = ref(false);
const testingId = ref<string | null>(null);
const deleteTarget = ref<WebhookEndpoint | null>(null);
const urlInput = ref<HTMLInputElement | null>(null);

const editor = reactive({
  open: false,
  id: null as string | null,
  url: "",
  enabled: true,
  events: new Set<string>(),
});

const EVENT_LABELS: Record<string, string> = {
  "file.created": "Created",
  "file.renamed": "Renamed",
  "file.moved": "Moved",
  "file.copied": "Copied",
  "file.deleted": "Deleted",
  "file.uploaded": "Uploaded",
};
const eventLabel = (e: string) => EVENT_LABELS[e] ?? e;

const validUrl = (u: string) => /^https?:\/\/.+/i.test(u);

const eventsSummary = (events: string[]) =>
  !events || events.length === 0
    ? "All file events"
    : events.map(eventLabel).join(", ");

const relTime = (ts: string) => dayjs(ts).fromNow();

const load = async () => {
  loading.value = true;
  error.value = "";
  try {
    const res = await api.list();
    endpoints.value = res.endpoints ?? [];
    eventTypes.value = res.eventTypes ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Request failed.";
  } finally {
    loading.value = false;
  }
};

const focusUrl = () => nextTick(() => urlInput.value?.focus());

const openNew = () => {
  editor.open = true;
  editor.id = null;
  editor.url = "";
  editor.enabled = true;
  editor.events = new Set();
  focusUrl();
};

const openEdit = (ep: WebhookEndpoint) => {
  editor.open = true;
  editor.id = ep.id;
  editor.url = ep.url;
  editor.enabled = ep.enabled;
  editor.events = new Set(ep.events ?? []);
  focusUrl();
};

const cancelEdit = () => {
  editor.open = false;
};

const toggleEditorEvent = (ev: string) => {
  if (editor.events.has(ev)) editor.events.delete(ev);
  else editor.events.add(ev);
};

const save = async () => {
  if (!validUrl(editor.url)) return;
  saving.value = true;
  const input = {
    url: editor.url,
    enabled: editor.enabled,
    events: [...editor.events],
  };
  try {
    if (editor.id) {
      await api.update(editor.id, input);
      $showSuccess("Webhook updated.");
    } else {
      await api.create(input);
      $showSuccess("Webhook created.");
    }
    editor.open = false;
    await load();
  } catch (e) {
    $showError(e instanceof Error ? e : "Couldn't save the webhook.");
  } finally {
    saving.value = false;
  }
};

const toggleEnabled = async (ep: WebhookEndpoint, enabled: boolean) => {
  try {
    await api.update(ep.id, { url: ep.url, enabled, events: ep.events ?? [] });
    ep.enabled = enabled;
  } catch (e) {
    $showError(e instanceof Error ? e : "Couldn't update the webhook.");
  }
};

const runTest = async (ep: WebhookEndpoint) => {
  testingId.value = ep.id;
  try {
    const res = await api.test(ep.id);
    if (res.ok) {
      $showSuccess(`Test delivered (HTTP ${res.code}).`);
    } else {
      $showError(
        res.error
          ? `Test failed: ${res.error}`
          : `Test failed (HTTP ${res.code || "no response"}).`
      );
    }
    await load(); // refresh last-delivery status
  } catch (e) {
    $showError(e instanceof Error ? e : "Test request failed.");
  } finally {
    testingId.value = null;
  }
};

const askDelete = (ep: WebhookEndpoint) => {
  deleteTarget.value = ep;
};

const doDelete = async () => {
  const ep = deleteTarget.value;
  deleteTarget.value = null;
  if (!ep) return;
  try {
    await api.remove(ep.id);
    $showSuccess("Webhook deleted.");
    await load();
  } catch (e) {
    $showError(e instanceof Error ? e : "Couldn't delete the webhook.");
  }
};

load();
</script>

<style scoped>
.wh-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 7px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;
}
.wh-add-btn:hover:not(:disabled) {
  border-color: var(--color-accent, #5e6ad2);
  color: var(--color-accent, #5e6ad2);
}
.wh-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Editor */
.wh-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-canvas, #fafaf9);
}
.wh-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.wh-field > span {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-3, #a1a1aa);
}
.wh-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}
.wh-events {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 4px;
}
.wh-event-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  cursor: pointer;
}
.wh-toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  cursor: pointer;
}
.wh-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.wh-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;
}
.wh-btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
}
.wh-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: #fff;
}
.wh-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
}
.wh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* States */
.wh-state {
  display: flex;
  justify-content: center;
  padding: 32px 0;
  color: var(--color-ink-3, #a1a1aa);
}
.wh-spin {
  animation: wh-spin 0.9s linear infinite;
}
@keyframes wh-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .wh-spin {
    animation: none;
  }
}

/* List */
.wh-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wh-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-surface, #fff);
}
.wh-row__main {
  flex: 1;
  min-width: 0;
}
.wh-row__url {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wh-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-top: 4px;
  font-size: 11.5px;
}
.wh-events-summary {
  color: var(--color-ink-3, #a1a1aa);
}
.wh-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.wh-status--success {
  color: #16a34a;
}
.wh-status--failed {
  color: #dc2626;
}
.wh-status--idle {
  color: var(--color-ink-3, #a1a1aa);
}

.wh-row__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.wh-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 7px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
.wh-icon-btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.wh-icon-btn--danger:hover:not(:disabled) {
  border-color: rgba(220, 38, 38, 0.4);
  color: #dc2626;
}
.wh-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
