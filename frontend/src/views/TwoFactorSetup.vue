<template>
  <main class="tf-setup" data-testid="two-factor-setup">
    <div class="tf-setup__card">
      <div class="tf-setup__icon" aria-hidden="true">
        <Icon name="shield-check" :size="20" :stroke-width="1.7" />
      </div>
      <h1 class="tf-setup__title">Set up two-factor sign-in</h1>
      <p class="tf-setup__lead">
        This server requires admins to use two-factor sign-in. Admin settings
        stay locked until it's on; your files work as usual in the meantime.
      </p>

      <TwoFactorSettings @done="finish" />

      <div class="tf-setup__actions">
        <button type="button" class="tf-setup__link" @click="later">
          Not now, go to my files
        </button>
        <button type="button" class="tf-setup__link" @click="signOut">
          Sign out
        </button>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
/**
 * Shown to an admin without a second factor when the server requires one
 * (4.0 lockout protection). Finishing set-up renews the session token, which
 * clears the flag, then continues where they were going.
 */
import { inject } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import TwoFactorSettings from "@/components/settings/TwoFactorSettings.vue";
import { useAuthStore } from "@/stores/auth";
import { logout, renew } from "@/utils/auth";
import { skipTwoFactorSetup } from "@/composables/useTwoFactorPrompt";

const $showError = inject<IToastError>("$showError")!;
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const target = () => {
  const r = route.query.redirect;
  return typeof r === "string" && r.startsWith("/") ? r : "/files/";
};

const finish = async () => {
  try {
    await renew(authStore.jwt);
  } catch (e) {
    $showError(e instanceof Error ? e : String(e));
    return;
  }
  void router.replace(target());
};

const later = () => {
  skipTwoFactorSetup();
  // Admin pages would only bring them back here.
  const t = target();
  void router.replace(t.startsWith("/settings/") ? "/files/" : t);
};

const signOut = () => logout();
</script>

<style scoped>
.tf-setup {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 64px 16px;
  box-sizing: border-box;
  background: var(--color-canvas, #efeff4);
}
.tf-setup__card {
  width: min(640px, 100%);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #dbdae3);
  border-radius: var(--radius-lg, 12px);
  padding: 28px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tf-setup__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.1));
  color: var(--color-accent, #6e72d9);
}
.tf-setup__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--color-ink-1, #17161d);
}
.tf-setup__lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-ink-2, #4c4a57);
}
.tf-setup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 4px;
}
.tf-setup__link {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  color: var(--color-ink-3, #747180);
  text-decoration: underline;
  cursor: pointer;
}
.tf-setup__link:hover {
  color: var(--color-ink-1, #17161d);
}
</style>
