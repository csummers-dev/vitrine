import { disableExternal, baseURL } from "@/utils/constants";
import { createApp } from "vue";
import VueNumberInput from "@chenfengyuan/vue-number-input";
import Toast, { POSITION, useToast } from "vue-toastification";
import type {
  ToastOptions,
  PluginOptions,
} from "vue-toastification/dist/types/types";
import createPinia from "@/stores";
import router from "@/router";
import i18n from "@/i18n";
import App from "@/App.vue";
import CustomToast from "@/components/CustomToast.vue";

import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";

import "./css/styles.css";

// register dayjs plugins globally
dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.extend(duration);

const pinia = createPinia(router);

const app = createApp(App);

app.component(VueNumberInput.name || "vue-number-input", VueNumberInput);
app.use(Toast, {
  transition: "Vue-Toastification__bounce",
  maxToasts: 10,
  // Newest stacks on top, oldest below (top-right container grows downward).
  newestOnTop: true,
  // One consistent placement for EVERY toast. `position` must be set both here
  // (the plugin default for the bare `toast()` API) and in `toastConfig` below
  // (the $showError/$showSuccess helpers) — if they diverge, toasts land in
  // different corners. Top-right keeps move/copy + result toasts clear of the
  // bottom-left transfer dock and bottom-center selection pill.
  position: POSITION.TOP_RIGHT,
  timeout: 4000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: "button",
  icon: true,
} satisfies PluginOptions);

app.use(i18n);
app.use(pinia);
app.use(router);

app.mixin({
  mounted() {
    // expose vue instance to components
    this.$el.__vue__ = this;
  },
});

// provide v-focus for components
app.directive("focus", {
  mounted: async (el) => {
    // initiate focus for the element
    el.focus();
  },
});

const toastConfig = {
  position: POSITION.TOP_RIGHT,
  timeout: 4000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: "button",
  icon: true,
} satisfies ToastOptions;

app.provide("$showSuccess", (message: string) => {
  const $toast = useToast();
  // Success toasts auto-dismiss after 5s (slightly longer than the global
  // default) and never render an action button — only the close X. The
  // global `pauseOnHover: true` keeps the timer paused while the cursor
  // is over the toast, so a user that's reading doesn't lose it.
  $toast.success(
    {
      component: CustomToast,
      props: {
        message: message,
      },
    },
    { ...toastConfig, timeout: 5000, rtl: false }
  );
});

app.provide("$showError", (error: Error | string, displayReport = true) => {
  const $toast = useToast();
  $toast.error(
    {
      component: CustomToast,
      props: {
        message: (error as Error).message || error,
        isReport: !disableExternal && displayReport,
        // TODO: could you add this to the component itself?
        reportText: i18n.global.t("buttons.reportIssue"),
      },
    },
    {
      ...toastConfig,
      timeout: 0,
      rtl: false,
    }
  );
});

// English is the only language and its messages are bundled eagerly, so we
// just wait for the router before mounting.
router.isReady().then(() => app.mount("#app"));

// v1.3 S6-4: register the offline-shell service worker. Production only —
// in dev the Vite HMR client must own the page, and a worker caching the
// shell would fight it. Served from the app root (BaseURL) so its scope
// covers navigations + /static. Registration failure is non-fatal: the
// app works exactly as before, just without offline boot.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
    navigator.serviceWorker
      .register(`${base}service-worker.js`)
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}
