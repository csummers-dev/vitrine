<template>
  <SettingsPage
    :title="t('settings.shareManagement')"
    icon="share-2"
    accent="var(--c-teal)"
    description="Public links you've created. Anyone with a link can access the file or folder without signing in."
  >
    <SettingsSection
      :title="`Active links (${links.length})`"
      :description="sectionDescription"
      :has-rows="false"
    >
      <!-- Empty state -->
      <div v-if="links.length === 0" class="shares-empty">
        <div class="shares-empty__icon">
          <Icon name="link-2" :size="20" :stroke-width="1.4" />
        </div>
        <div class="shares-empty__title">No share links yet</div>
        <div class="shares-empty__hint">
          To create one, open a file or folder and use the Share action.
        </div>
      </div>

      <!-- Share list -->
      <ul v-else class="shares-list">
        <li v-for="link in links" :key="link.hash" class="shares-card">
          <!-- Top row: path + actions -->
          <div class="shares-card__top">
            <div class="shares-card__path-wrap">
              <a
                :href="buildLink(link)"
                target="_blank"
                rel="noopener"
                class="shares-card__path"
                :title="link.path"
              >
                <Icon
                  :name="link.path?.endsWith('/') ? 'folder' : 'file'"
                  :size="13"
                />
                <span>{{ link.path }}</span>
              </a>
            </div>
            <div class="shares-card__actions">
              <button
                type="button"
                class="shares-icon-btn"
                title="Copy link"
                aria-label="Copy link"
                @click="copyToClipboard(buildLink(link))"
              >
                <Icon name="clipboard" :size="13" />
              </button>
              <button
                type="button"
                class="shares-icon-btn shares-icon-btn--danger"
                title="Revoke"
                aria-label="Revoke"
                @click="deleteLink(link)"
              >
                <Icon name="trash-2" :size="13" />
              </button>
            </div>
          </div>

          <!-- Read-only URL field for visibility -->
          <input
            readonly
            type="text"
            class="shares-card__url"
            :value="buildLink(link)"
            @focus="(e) => (e.target as HTMLInputElement).select()"
          />

          <!-- Meta row: expiration / password / owner -->
          <div class="shares-card__meta">
            <span class="shares-meta-chip">
              <Icon name="clock-3" :size="11" />
              <span v-if="link.expire !== 0">
                Expires {{ humanTime(link.expire) }}
              </span>
              <span v-else>Never expires</span>
            </span>
            <span v-if="(link as any).password_hash" class="shares-meta-chip">
              <Icon name="lock" :size="11" />
              Password protected
            </span>
            <span
              v-if="authStore.user?.perm.admin && link.username"
              class="shares-meta-chip"
            >
              <Icon name="user" :size="11" />
              {{ link.username }}
            </span>
          </div>
        </li>
      </ul>
    </SettingsSection>
  </SettingsPage>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { share as api, users } from "@/api";
import { copy } from "@/utils/clipboard";
import dayjs from "dayjs";

import SettingsPage from "@/components/settings/SettingsPage.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import Icon from "@/components/Icon.vue";

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;
const { t } = useI18n();

const authStore = useAuthStore();
const layoutStore = useLayoutStore();

const links = ref<Share[]>([]);

const sectionDescription = computed(() =>
  links.value.length === 0
    ? "You haven't created any share links yet. Open the InfoPane for a file, then click Share to generate one."
    : "Revoke a link any time to disable access."
);

onMounted(async () => {
  layoutStore.loading = true;
  try {
    const newLinks = await api.list();
    if (authStore.user?.perm.admin) {
      const userMap = new Map<number, string>();
      for (const user of await users.getAll()) {
        userMap.set(user.id, user.username);
      }
      for (const link of newLinks) {
        if (link.userID && userMap.has(link.userID)) {
          link.username = userMap.get(link.userID);
        }
      }
    }
    links.value = newLinks;
  } catch (err) {
    if (err instanceof Error) $showError(err);
  } finally {
    layoutStore.loading = false;
  }
});

const copyToClipboard = async (text: string) => {
  try {
    await copy({ text });
    $showSuccess(t("success.linkCopied"));
  } catch {
    try {
      await copy({ text }, { permission: true });
      $showSuccess(t("success.linkCopied"));
    } catch (e) {
      if (e instanceof Error) $showError(e);
    }
  }
};

const deleteLink = (link: Share) => {
  // Reuse the existing share-delete confirm prompt for parity with the
  // other revoke flows. When confirmed, optimistically remove from the
  // local list.
  layoutStore.showHover({
    prompt: "share-delete",
    confirm: () => {
      layoutStore.closeHovers();
      try {
        api.remove(link.hash);
        links.value = links.value.filter((item) => item.hash !== link.hash);
        $showSuccess(t("settings.shareDeleted"));
      } catch (err) {
        if (err instanceof Error) $showError(err);
      }
    },
  });
};

const humanTime = (time: number) => dayjs(time * 1000).fromNow();
const buildLink = (share: Share) => api.getShareURL(share);
</script>

<style scoped>
.shares-list {
  list-style: none;
  padding: 14px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shares-card {
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-canvas, #fafaf9);
  padding: 12px;
}

.shares-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.shares-card__path-wrap {
  flex: 1;
  min-width: 0;
}

.shares-card__path {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  text-decoration: none;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shares-card__path:hover {
  color: var(--color-accent, #5e6ad2);
  text-decoration: underline;
}

.shares-card__path :deep(svg) {
  flex-shrink: 0;
  color: var(--color-ink-3, #a1a1aa);
}

.shares-card__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.shares-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease,
    border-color 0.1s ease;
}

.shares-icon-btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.shares-icon-btn--danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #dc2626;
  border-color: #fecaca;
}

.shares-card__url {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--color-ink-2, #52525b);
  outline: none;
}

.shares-card__url:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}

.shares-card__meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.shares-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
  font-size: 11px;
  font-weight: 500;
}

.shares-meta-chip :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
}

/* Empty state */
.shares-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 20px;
  text-align: center;
}

.shares-empty__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.shares-empty__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}

.shares-empty__hint {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  max-width: 300px;
  line-height: 1.45;
}
</style>
