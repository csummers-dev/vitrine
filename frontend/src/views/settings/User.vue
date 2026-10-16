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

    <!-- 4.4: an admin can reset a user's second factor. -->
    <div
      v-if="user && !isNew && userHas2fa"
      class="user-edit__2fa"
      data-testid="user-2fa"
    >
      <Icon name="shield-check" :size="14" />
      <span>Two-factor sign-in is on for this user.</span>
      <UiButton size="sm" @click="confirmReset2fa = true">Reset</UiButton>
    </div>
    <ConfirmDialog
      :open="confirmReset2fa"
      title="Reset two-factor sign-in?"
      message="They'll sign in with their password alone until they set it up again."
      confirm-label="Reset"
      cancel-label="Cancel"
      destructive
      @confirm="reset2fa"
      @cancel="confirmReset2fa = false"
    />

    <!-- Sticky bottom action bar. Stays visible while editing long forms. -->
    <div v-if="user" class="user-edit__actions">
      <UiButton
        v-if="!isNew"
        variant="ghost"
        icon="trash-2"
        @click="deletePrompt"
        >{{ t("buttons.delete") }}</UiButton
      >
      <div class="user-edit__spacer"></div>
      <UiButton variant="ghost" to="/settings/users">{{
        t("buttons.cancel")
      }}</UiButton>
      <UiButton
        variant="primary"
        :disabled="isNew && !canCreate"
        :disabled-reason="createDisabledReason"
        @click="save"
        >{{ isNew ? "Create user" : t("buttons.save") }}</UiButton
      >
    </div>
  </SettingsPage>
</template>

<script setup lang="ts">
import UiButton from "@/components/ui/UiButton.vue";
import { computed, inject, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { users as api, settings, twofactor } from "@/api";
import { StatusError } from "@/api/utils";
import { authMethod } from "@/utils/constants";
import { logout } from "@/utils/auth";

import SettingsPage from "@/components/settings/SettingsPage.vue";
import UserForm from "@/components/settings/UserForm.vue";
import Icon from "@/components/Icon.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";

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
      try {
        userHas2fa.value = await twofactor.userStatus(parseInt(id));
      } catch {
        userHas2fa.value = false;
      }
    }
  } catch (err) {
    if (err instanceof Error) $showError(err);
  } finally {
    layoutStore.loading = false;
  }
};

// 4.4: reset (remove) the user's second factor.
const userHas2fa = ref(false);
const confirmReset2fa = ref(false);
const reset2fa = async () => {
  confirmReset2fa.value = false;
  if (!user.value) return;
  try {
    await twofactor.reset(user.value.id);
    userHas2fa.value = false;
    $showSuccess("Two-factor sign-in was reset.");
  } catch (e) {
    if (e instanceof Error) $showError(e);
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
.user-edit__2fa {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  font-size: 13px;
  color: var(--color-ink-2);
}
.user-edit__2fa span {
  flex: 1;
}
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
  background: var(--color-canvas);
  border-top: 1px solid var(--color-line);
  z-index: 5;
}

.user-edit__spacer {
  flex: 1;
}

@media (max-width: 540px) {
  .user-edit__actions {
    margin: 28px -16px -60px;
    padding: 10px 16px;
  }
}
</style>
