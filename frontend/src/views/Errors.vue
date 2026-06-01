<template>
  <main class="error-page" :class="{ 'has-header': showHeader }">
    <header-bar v-if="showHeader" showMenu showLogo />

    <div class="error-page__body">
      <div class="error-page__card">
        <div class="error-page__icon" :class="info.tone">
          <Icon :name="info.icon" :size="22" :stroke-width="1.6" />
        </div>
        <div class="error-page__code">{{ info.code }}</div>
        <h1 class="error-page__title">{{ info.title }}</h1>
        <p class="error-page__message">{{ t(info.message) }}</p>
        <!-- S6-5: for transient failures (offline / 500) offer an in-place
             retry so the user doesn't have to navigate away and back. -->
        <button
          v-if="canRetry"
          type="button"
          class="error-page__btn error-page__btn--primary error-page__btn--retry"
          @click="emit('retry')"
        >
          <Icon name="rotate-ccw" :size="13" />
          Try again
        </button>
        <div class="error-page__actions">
          <button
            type="button"
            class="error-page__btn error-page__btn--ghost"
            @click="goBack"
          >
            <Icon name="arrow-left" :size="13" />
            Back
          </button>
          <router-link
            to="/files/"
            class="error-page__btn"
            :class="
              canRetry ? 'error-page__btn--ghost' : 'error-page__btn--primary'
            "
          >
            <Icon name="folder" :size="13" />
            Go to files
          </router-link>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import HeaderBar from "@/components/header/HeaderBar.vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

const { t } = useI18n({});
const router = useRouter();

interface ErrorInfo {
  icon: string;
  message: string;
  title: string;
  code: string;
  tone: "danger" | "warn" | "info";
}

const errors: Record<number, ErrorInfo> = {
  0: {
    icon: "cloud-off",
    message: "errors.connection",
    title: "Can't reach the server",
    code: "Offline",
    tone: "warn",
  },
  403: {
    icon: "lock",
    message: "errors.forbidden",
    title: "Access denied",
    code: "403",
    tone: "danger",
  },
  404: {
    icon: "map-pin-off",
    message: "errors.notFound",
    title: "Page not found",
    code: "404",
    tone: "info",
  },
  500: {
    icon: "circle-alert",
    message: "errors.internal",
    title: "Something went wrong",
    code: "500",
    tone: "danger",
  },
};

const props = withDefaults(
  defineProps<{
    errorCode?: number;
    showHeader?: boolean;
    /** S6-5: when a `retry` listener is attached, show a "Try again"
     *  button — but only for transient codes (offline / 5xx); retrying a
     *  403/404 won't help. Set `retryable` explicitly to override. */
    retryable?: boolean;
  }>(),
  {
    errorCode: 500,
    showHeader: false,
    retryable: undefined,
  }
);

const emit = defineEmits<{
  (e: "retry"): void;
}>();

const info = computed<ErrorInfo>(() => errors[props.errorCode] ?? errors[500]);

/** Transient codes worth retrying in place: offline (0) and server (5xx). */
const isTransient = (code: number): boolean => code === 0 || code >= 500;

const canRetry = computed<boolean>(() =>
  props.retryable !== undefined ? props.retryable : isTransient(props.errorCode)
);

const goBack = () => {
  // Prefer browser history if there's somewhere to go; otherwise default
  // to /files/ as the safe landing.
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push("/files/");
  }
};
</script>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-1, #18181b);
  font-family: var(--font-sans, system-ui);
}

.error-page__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.error-page__card {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 14px;
  padding: 28px 24px 22px;
  box-shadow:
    0 24px 48px -16px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.error-page__icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.error-page__icon.danger {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}

.error-page__icon.warn {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
}

.error-page__icon.info {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
}

.error-page__code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-3, #a1a1aa);
}

.error-page__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--color-ink-1, #18181b);
}

.error-page__message {
  margin: 4px 0 18px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-ink-2, #52525b);
  max-width: 320px;
}

.error-page__actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

/* S6-5: full-width retry sits above the Back / Go-to-files row. */
.error-page__btn--retry {
  width: 100%;
  margin-bottom: 8px;
}

.error-page__btn {
  flex: 1;
  height: 36px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-decoration: none;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.error-page__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.error-page__btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.error-page__btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.error-page__btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.error-page__btn--primary:hover {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #4f5ac4);
}

/* When showHeader is on (embedded errors), the body should sit BELOW the
   header bar with normal flow instead of vertically centering on the
   viewport. */
.error-page.has-header .error-page__body {
  align-items: flex-start;
  padding-top: 10vh;
}
</style>
