<template>
  <SettingsPage
    title="User Management"
    icon="users"
    accent="var(--color-accent)"
    description="Add and manage accounts that can sign in to this filebrowser instance."
  >
    <SettingsSection
      :title="`Users (${users.length})`"
      :description="
        users.length === 0
          ? 'No accounts yet. Create one to get started.'
          : 'Click a row to edit its permissions, scope, and rules.'
      "
      :has-rows="false"
    >
      <template #headerRight>
        <router-link
          to="/settings/users/new"
          class="users-btn users-btn--primary"
        >
          <Icon name="plus" :size="13" />
          New user
        </router-link>
      </template>

      <!-- Empty state -->
      <div v-if="users.length === 0" class="users-empty">
        <div class="users-empty__icon">
          <Icon name="users" :size="20" :stroke-width="1.4" />
        </div>
        <div class="users-empty__title">No users yet</div>
        <router-link
          to="/settings/users/new"
          class="users-btn users-btn--primary users-empty__cta"
        >
          <Icon name="plus" :size="13" />
          Create the first user
        </router-link>
      </div>

      <!-- User list — two-row card so the identity line doesn't compete
           with the permission chips for horizontal space. -->
      <ul v-else class="users-list">
        <li v-for="user in users" :key="user.id">
          <router-link :to="'/settings/users/' + user.id" class="users-card">
            <!-- Top row: avatar + identity + chevron -->
            <div class="users-card__top">
              <div
                class="users-card__avatar"
                :class="
                  user.perm.admin
                    ? 'users-card__avatar--admin'
                    : 'users-card__avatar--user'
                "
              >
                {{ initials(user.username) }}
              </div>

              <div class="users-card__identity">
                <div class="users-card__name-line">
                  <span class="users-card__name">{{ user.username }}</span>
                  <span
                    v-if="user.perm.admin"
                    class="users-card__chip is-admin"
                  >
                    Admin
                  </span>
                  <span
                    v-if="user.lockPassword"
                    class="users-card__chip"
                    title="Password change disabled"
                  >
                    <Icon name="lock" :size="10" />
                    Locked
                  </span>
                </div>
                <div v-if="user.scope" class="users-card__scope">
                  <Icon name="folder" :size="11" />
                  <span>{{ user.scope }}</span>
                </div>
              </div>

              <Icon name="chevron-right" :size="14" class="users-card__chev" />
            </div>

            <!-- Bottom row: permission chips, indented to align with name -->
            <div v-if="summaryPerms(user).length > 0" class="users-card__perms">
              <span
                v-for="p in summaryPerms(user)"
                :key="p.key"
                class="users-perm-chip"
                :title="p.label"
              >
                <Icon :name="p.icon" :size="10" />
                {{ p.short }}
              </span>
            </div>
          </router-link>
        </li>
      </ul>
    </SettingsSection>
  </SettingsPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useLayoutStore } from "@/stores/layout";
import { users as api } from "@/api";

import SettingsPage from "@/components/settings/SettingsPage.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import Icon from "@/components/Icon.vue";

const users = ref<IUser[]>([]);
const layoutStore = useLayoutStore();

onMounted(async () => {
  layoutStore.loading = true;
  try {
    users.value = await api.getAll();
  } finally {
    layoutStore.loading = false;
  }
});

const initials = (username: string) => {
  if (!username) return "?";
  const parts = username.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
};

/**
 * Surface a compact, scan-friendly set of permission chips per row. We pick
 * the verbs that most affect blast radius (write/share/exec) — not every
 * permission needs a chip on the list view; the edit page shows the full set.
 */
const summaryPerms = (user: IUser) => {
  const list: { key: string; short: string; label: string; icon: string }[] =
    [];
  const p: IUser["perm"] = user.perm;
  if (p.create)
    list.push({
      key: "create",
      short: "Create",
      label: "Can create",
      icon: "plus",
    });
  if (p.modify)
    list.push({
      key: "modify",
      short: "Edit",
      label: "Can edit",
      icon: "pencil",
    });
  if (p.delete)
    list.push({
      key: "delete",
      short: "Delete",
      label: "Can delete",
      icon: "trash-2",
    });
  if (p.share)
    list.push({
      key: "share",
      short: "Share",
      label: "Can share",
      icon: "share-2",
    });
  if (p.execute)
    list.push({
      key: "execute",
      short: "Exec",
      label: "Can execute commands",
      icon: "terminal",
    });
  return list;
};
</script>

<style scoped>
/* ── Buttons ─────────────────────────────────────────────────────────── */
.users-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.users-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.users-btn--primary:hover {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #4f5ac4);
}

/* ── User list ───────────────────────────────────────────────────────── */
.users-list {
  list-style: none;
  padding: 8px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Card — two stacked rows so the perm chips never compete with the name. */
.users-card {
  display: block;
  padding: 10px 12px 12px;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.08s ease;
}

.users-card:hover {
  background: var(--color-elevated, #f4f4f5);
}

.users-card__top {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Avatar */
.users-card__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* Calm Minimal: avatars follow the single accent (was a six-hue conic). */
.users-card__avatar--admin,
.users-card__avatar--user {
  background: var(--accent-gradient);
}

/* Identity column */
.users-card__identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.users-card__name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.users-card__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
}

.users-card__chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
  flex-shrink: 0;
}

.users-card__chip.is-admin {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
}

.users-card__scope {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  min-width: 0;
}

.users-card__scope > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.users-card__scope :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.users-card__chev {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

/* Permission chips — bottom row, indented to align with the name. */
.users-card__perms {
  margin-top: 10px;
  /* 34px avatar + 12px gap = 46px */
  margin-left: 46px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.users-perm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--color-canvas, #fafaf9);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.4;
}

.users-perm-chip :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
}

/* ── Empty state ────────────────────────────────────────────────────── */
.users-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 44px 20px;
  text-align: center;
}

.users-empty__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.users-empty__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}

.users-empty__cta {
  margin-top: 10px;
}

/* At very narrow widths the perm chips can wrap heavily; collapse the
   indent so they get more room without floating into the avatar column. */
@media (max-width: 540px) {
  .users-card__perms {
    margin-left: 0;
    margin-top: 8px;
  }
}
</style>
