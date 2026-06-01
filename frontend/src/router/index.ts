import type { RouteLocation } from "vue-router";
import { createRouter, createWebHistory } from "vue-router";
import Login from "@/views/Login.vue";
import Layout from "@/views/Layout.vue";
import Files from "@/views/Files.vue";
import SmartFolderView from "@/views/SmartFolderView.vue";
import Share from "@/views/Share.vue";
import Users from "@/views/settings/Users.vue";
import User from "@/views/settings/User.vue";
import Settings from "@/views/Settings.vue";
import GlobalSettings from "@/views/settings/Global.vue";
import ProfileSettings from "@/views/settings/Profile.vue";
import Shares from "@/views/settings/Shares.vue";
import Audit from "@/views/settings/Audit.vue";
import Sessions from "@/views/settings/Sessions.vue";
import Webhooks from "@/views/settings/Webhooks.vue";
import Errors from "@/views/Errors.vue";
import { useAuthStore } from "@/stores/auth";
import { useUploadStore } from "@/stores/upload";
import { baseURL, name } from "@/utils/constants";
import i18n from "@/i18n";
import { recaptcha, loginPage } from "@/utils/constants";
import { login, validateLogin } from "@/utils/auth";

const titles = {
  Login: "sidebar.login",
  Share: "buttons.share",
  Files: "files.files",
  SmartFolder: "files.smartFolder",
  Settings: "sidebar.settings",
  ProfileSettings: "settings.profileSettings",
  Shares: "settings.shareManagement",
  Sessions: "settings.sessions",
  GlobalSettings: "settings.globalSettings",
  Users: "settings.users",
  User: "settings.user",
  Audit: "settings.audit",
  Webhooks: "settings.webhooks",
  Forbidden: "errors.forbidden",
  NotFound: "errors.notFound",
  InternalServerError: "errors.internal",
};

const routes = [
  {
    path: "/login",
    name: "Login",
    component: Login,
  },
  {
    path: "/share",
    component: Layout,
    children: [
      {
        path: ":path*",
        name: "Share",
        component: Share,
      },
    ],
  },
  {
    path: "/files",
    component: Layout,
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: ":path*",
        name: "Files",
        component: Files,
      },
    ],
  },
  // Smart folders (v1.3 S2-6). Synthetic route — there's no folder
  // on disk; the view evaluates a saved query and renders matching
  // files. Reuses the same Layout chrome (sidebar + topbar) as Files.
  {
    path: "/smart/:id",
    component: Layout,
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: "",
        name: "SmartFolder",
        component: SmartFolderView,
      },
    ],
  },
  {
    path: "/settings",
    component: Layout,
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: "",
        name: "Settings",
        component: Settings,
        redirect: {
          path: "/settings/profile",
        },
        children: [
          {
            path: "profile",
            name: "ProfileSettings",
            component: ProfileSettings,
          },
          {
            path: "shares",
            name: "Shares",
            component: Shares,
          },
          {
            path: "sessions",
            name: "Sessions",
            component: Sessions,
          },
          {
            path: "global",
            name: "GlobalSettings",
            component: GlobalSettings,
            meta: {
              requiresAdmin: true,
            },
          },
          {
            path: "users",
            name: "Users",
            component: Users,
            meta: {
              requiresAdmin: true,
            },
          },
          {
            path: "users/:id",
            name: "User",
            component: User,
            meta: {
              requiresAdmin: true,
            },
          },
          {
            path: "audit",
            name: "Audit",
            component: Audit,
            meta: {
              requiresAdmin: true,
            },
          },
          {
            path: "webhooks",
            name: "Webhooks",
            component: Webhooks,
            meta: {
              requiresAdmin: true,
            },
          },
        ],
      },
    ],
  },
  {
    path: "/403",
    name: "Forbidden",
    component: Errors,
    props: {
      errorCode: 403,
      showHeader: true,
    },
  },
  {
    path: "/404",
    name: "NotFound",
    component: Errors,
    props: {
      errorCode: 404,
      showHeader: true,
    },
  },
  {
    path: "/500",
    name: "InternalServerError",
    component: Errors,
    props: {
      errorCode: 500,
      showHeader: true,
    },
  },
  {
    path: "/:catchAll(.*)*",
    redirect: (to: RouteLocation) => {
      const catchAll = to.params.catchAll;
      if (!catchAll) return "/files/";
      return `/files/${Array.isArray(catchAll) ? catchAll.join("/") : catchAll}`;
    },
  },
];

async function initAuth() {
  if (loginPage) {
    await validateLogin();
  } else {
    await login("", "", "");
  }

  if (recaptcha) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (typeof window.grecaptcha === "undefined") {
          setTimeout(check, 100);
        } else {
          resolve();
        }
      };

      check();
    });
  }
}

const router = createRouter({
  history: createWebHistory(baseURL),
  routes,
});

// Active-upload navigation guard (H8). The browser-native
// beforeunload dialog has hardcoded text we can't customize, so we
// intercept in-app navigation FIRST and surface a custom confirm
// with specific context — "5 uploads in progress" beats Chrome's
// generic "Leave site?". Skipped when:
//   - First navigation (from.name is null): the app is bootstrapping,
//     there can't be uploads in progress.
//   - to.path === from.path: same-route refresh trigger.
//   - No uploads pending: hot path, no overhead.
// Hard refresh / tab close / browser close still fall through to the
// beforeunload handler in stores/upload.ts (browser-controlled text).
router.beforeEach(async (to, from) => {
  if (from.name == null) return true;
  if (to.path === from.path) return true;
  const uploadStore = useUploadStore();
  const pending = uploadStore.pendingUploadCount;
  if (pending <= 0) return true;
  const label = pending === 1 ? "1 upload is" : `${pending} uploads are`;
  // Native confirm() lets us write our own message. Modal, blocks
  // until the user responds, returns boolean. Vue Router treats
  // `return false` as a cancel.
  const proceed = window.confirm(
    `${label} still in progress. Leaving this page will cancel them.\n\nDo you want to leave anyway?`
  );
  return proceed;
});

// Modernized to Vue Router 5's return-value navigation guards (G1):
//   - return false           → cancel navigation
//   - return undefined/true  → proceed with the original navigation
//   - return a route object  → redirect to that route
// The legacy `next(...)` callback still works but logs a deprecation
// warning on every navigation, polluting the console.
router.beforeResolve(async (to, from) => {
  // Guard against a route whose name has no entry in `titles`: passing
  // `undefined` to i18n.t throws and aborts navigation (this is what
  // broke the Sessions/Audit/Webhooks routes). Fall back to the bare app
  // name so a missing key degrades gracefully instead of dead-ending.
  const titleKey = titles[to.name as keyof typeof titles];
  document.title = titleKey ? i18n.global.t(titleKey) + " - " + name : name;

  const authStore = useAuthStore();

  // this will only be null on first route
  if (from.name == null) {
    try {
      await initAuth();
    } catch (error) {
      console.error(error);
    }
  }

  if (to.path.endsWith("/login") && authStore.isLoggedIn) {
    return { path: "/files/" };
  }

  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (!authStore.isLoggedIn) {
      return {
        path: "/login",
        query: { redirect: to.fullPath },
      };
    }

    if (to.matched.some((record) => record.meta.requiresAdmin)) {
      if (authStore.user === null || !authStore.user.perm.admin) {
        return { path: "/403" };
      }
    }
  }

  // Implicit `return undefined` proceeds with navigation.
});

// Track the last visited /files path so the login flow can restore it
// when the "Re-open last visited page on login" global setting is on.
// Stored per-user under a localStorage key keyed by the username. The
// settings.get() consult happens at login time — not here — so this
// guard runs cheaply on every navigation.
const LAST_FILES_PATH_PREFIX = "fb:lastFilesPath:";
export const lastFilesPathKey = (username: string | undefined) =>
  LAST_FILES_PATH_PREFIX + (username ?? "_anon");

router.afterEach((to) => {
  // Only track listing routes; the login/settings/share routes aren't
  // meaningful as a return destination.
  if (!to.path.startsWith("/files")) return;
  try {
    const authStore = useAuthStore();
    const username = authStore.user?.username;
    if (!username) return;
    localStorage.setItem(lastFilesPathKey(username), to.fullPath);
  } catch {
    // localStorage may be disabled (e.g. private mode) — silently skip.
  }
});

export { router, router as default };
