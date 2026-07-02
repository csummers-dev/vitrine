<template>
  <SettingsPage
    :title="pageTitle"
    :description="pageDescription"
    icon="user-cog"
    accent="var(--color-accent)"
  >
    <form v-if="user" class="user-edit" @submit.prevent="save">
      <UserForm
        v-model:user="user"
        v-model:createUserDir="createUserDir"
        :isDefault="false"
        :isNew="isNew"
        :minimumPasswordLength="minimumPasswordLength"
      />
    </form>

    <!-- Sticky bottom action bar. Stays visible while editing long forms. -->
    <div v-if="user" class="user-edit__actions">
      <button
        v-if="!isNew"
        type="button"
        class="user-edit__btn user-edit__btn--danger"
        @click="deletePrompt"
      >
        <Icon name="trash-2" :size="13" />
        {{ t("buttons.delete") }}
      </button>
      <div class="user-edit__spacer"></div>
      <router-link
        to="/settings/users"
        class="user-edit__btn user-edit__btn--ghost"
      >
        {{ t("buttons.cancel") }}
      </router-link>
      <button
        type="button"
        class="user-edit__btn user-edit__btn--primary"
        :disabled="isNew && !canCreate"
        :title="isNew && !canCreate ? createDisabledReason : ''"
        @click="save"
      >
        {{ isNew ? "Create user" : t("buttons.save") }}
      </button>
    </div>
  </SettingsPage>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { users as api, settings } from "@/api";
import { StatusError } from "@/api/utils";
import { authMethod } from "@/utils/constants";
import { logout } from "@/utils/auth";

import SettingsPage from "@/components/settings/SettingsPage.vue";
import UserForm from "@/components/settings/UserForm.vue";
import Icon from "@/components/Icon.vue";

const originalUser = ref<IUser>();
const user = ref<IUser>();
const createUserDir = ref<boolean>(false);
const isCurrentPasswordRequired = ref<boolean>(false);
const minimumPasswordLength = ref<number>(1);

// Create-flow validation. Username must be non-empty (whitespace trimmed),
// and password must meet the minimum length. Showing the disabled state
// (with a tooltip explaining why) is friendlier than letting the user
// click and hit a backend error.
const canCreate = computed(() => {
  if (!user.value) return false;
  const uname = (user.value.username ?? "").trim();
  if (uname === "") return false;
  const pwd = user.value.password ?? "";
  if (pwd.length < minimumPasswordLength.value) return false;
  return true;
});

const createDisabledReason = computed(() => {
  if (!user.value) return "";
  if ((user.value.username ?? "").trim() === "") return "Enter a username.";
  const pwd = user.value.password ?? "";
  if (pwd.length < minimumPasswordLength.value) {
    return `Password must be at least ${minimumPasswordLength.value} characters.`;
  }
  return "";
});

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const authStore = useAuthStore();
const layoutStore = useLayoutStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const isNew = computed(() => route.path === "/settings/users/new");

const pageTitle = computed(() => {
  if (isNew.value) return "New user";
  return user.value?.username
    ? `Edit ${user.value.username}`
    : t("settings.user");
});

const pageDescription = computed(() =>
  isNew.value
    ? "Create a new account. You can grant administrator access in the Permissions section."
    : "Update account details, scope, and per-user permissions."
);

onMounted(() => fetchData());
watch(route, () => fetchData());

const fetchData = async () => {
  layoutStore.loading = true;
  try {
    // Settings fetched once and used for: default user template (new flow),
    // current-password requirement, and minimum password length validation.
    const cfg = await settings.get();
    minimumPasswordLength.value = cfg.minimumPasswordLength ?? 1;
    if (isNew.value) {
      isCurrentPasswordRequired.value = authMethod === "json";
      createUserDir.value = cfg.createUserDir;
      user.value = {
        ...cfg.defaults,
        username: "",
        password: "",
        rules: [],
        lockPassword: false,
        id: 0,
      };
    } else {
      isCurrentPasswordRequired.value = cfg.authMethod === "json";
      const id = Array.isArray(route.params.id)
        ? route.params.id.join("")
        : route.params.id;
      user.value = { ...(await api.get(parseInt(id))) };
    }
  } catch (err) {
    if (err instanceof Error) $showError(err);
  } finally {
    layoutStore.loading = false;
  }
};

const deletePrompt = () => {
  if (isCurrentPasswordRequired.value) {
    layoutStore.showHover({
      prompt: "current-password",
      confirm: (event: Event, currentPassword: string) => {
        event.preventDefault();
        layoutStore.closeHovers();
        deleteUser(currentPassword);
      },
    });
  } else {
    layoutStore.showHover({
      prompt: "deleteUser",
      confirm: () => deleteUser(""),
    });
  }
};

const deleteUser = async (currentPassword: string) => {
  if (!user.value) return;
  try {
    await api.remove(user.value.id, currentPassword);
    if (user.value.id === authStore.user?.id) {
      logout();
    } else {
      router.push({ path: "/settings/users" });
    }
    $showSuccess(t("settings.userDeleted"));
  } catch (err) {
    if (err instanceof StatusError) {
      err.status === 403 ? $showError(t("errors.forbidden")) : $showError(err);
    } else if (err instanceof Error) {
      $showError(err);
    }
  }
};

const save = (event?: Event) => {
  event?.preventDefault?.();
  if (isCurrentPasswordRequired.value) {
    layoutStore.showHover({
      prompt: "current-password",
      // The CurrentPassword prompt now awaits this callback. If we throw,
      // the prompt stays open and surfaces the error inline — perfect for
      // a wrong-password retry. We close ourselves only via the prompt
      // (it calls closeHovers on a clean resolve).
      confirm: async (e: Event, currentPassword: string) => {
        e.preventDefault();
        await send(currentPassword);
      },
    });
  } else {
    void send("");
  }
};

const send = async (currentPassword: string) => {
  if (!user.value) return;
  // Errors are propagated to the caller so that the CurrentPassword prompt
  // can show them inline. The two callers are: the prompt's confirm (which
  // awaits + catches) and the no-current-password path below (caught here
  // with $showError).
  try {
    if (isNew.value) {
      const newUser: IUser = {
        ...originalUser?.value,
        ...user.value,
      };
      const loc = await api.create(newUser, currentPassword);
      router.push({ path: loc || "/settings/users" });
      $showSuccess(t("settings.userCreated"));
    } else {
      await api.update(user.value, ["all"], currentPassword);
      if (user.value.id === authStore.user?.id) {
        authStore.updateUser(user.value);
      }
      $showSuccess(t("settings.userUpdated"));
    }
  } catch (e) {
    // When we're inside the current-password prompt, re-throw so it can
    // display the error inline. Otherwise (no-password path) fall back to
    // a toast.
    if (isCurrentPasswordRequired.value) {
      // Normalize 403 → friendly message; pass through other messages.
      if (
        e instanceof StatusError &&
        (e.status === 403 || /password/i.test(e.message))
      ) {
        throw new Error("Incorrect password. Please try again.");
      }
      throw e;
    }
    if (e instanceof Error) $showError(e);
  }
};
</script>

<style scoped>
.user-edit {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Sticky bottom action bar. Floats inside the scrollable settings-main but
   stays glued to the bottom so the user can save without scrolling back up. */
.user-edit__actions {
  position: sticky;
  bottom: 0;
  margin: 28px -32px -80px;
  padding: 12px 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  /* Solid canvas bg instead of translucent + backdrop-blur. The blurred
     sticky bar caused every keystroke in the form to re-rasterize the
     backdrop region, which made input lag noticeably on this page. */
  background: var(--color-canvas, #fafaf9);
  border-top: 1px solid var(--color-line, #ececec);
  z-index: 5;
}

.user-edit__spacer {
  flex: 1;
}

.user-edit__btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.user-edit__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

.user-edit__btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.user-edit__btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.user-edit__btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #6e72d9);
  color: white;
}

.user-edit__btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #575cc7);
}

/* Disabled state — applies to any variant so the user gets a visual cue
   when validation isn't passing (e.g. empty username, short password). */
.user-edit__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-edit__btn--danger {
  background: var(--color-surface, #fff);
  border-color: var(--status-danger-ring);
  color: var(--status-danger);
}

.user-edit__btn--danger:hover {
  background: var(--status-danger-soft);
}

@media (max-width: 540px) {
  .user-edit__actions {
    margin: 28px -16px -60px;
    padding: 10px 16px;
  }
}
</style>
