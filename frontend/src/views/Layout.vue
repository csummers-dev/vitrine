<template>
  <div class="app-shell flex overflow-hidden bg-canvas text-ink-1">
    <!-- Skip-to-content link: invisible until focused via Tab. Must be the
         first focusable element so a keyboard user reaches it before the
         sidebar's full nav tree. -->
    <a href="#main" class="skip-link" @click.prevent="skipToMain"
      >Skip to content</a
    >

    <div
      v-if="uploadStore.totalBytes"
      class="progress"
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(uploadStore.displayedPercent)"
    >
      <!-- Width drives off the store's displayedPercent (v1.3 H10) —
           a phantom-counter-backed value that doesn't regress when
           files are added to an in-progress queue. -->
      <div :style="{ width: uploadStore.displayedPercent + '%' }"></div>
    </div>

    <!-- Inline sidebar — visible at md+ (768px), where the full 256px rail
         fits. Below md it's hidden and the hamburger-triggered drawer takes
         over: there's no cramped icon-rail middle state — it's full sidebar OR
         on-demand drawer, nothing in between. -->
    <!-- A visitor on a public share page gets no sidebar (Phase 6, 5.5):
         the page carries the server's branding itself. -->
    <sidebar v-if="!publicPage" class="max-md:hidden" />

    <!-- Mobile drawer — purpose-built SidebarDrawer (not the inline
         Sidebar). The inline Sidebar's responsive max-md icon-rail
         layout is wrong for a drawer; a dedicated component gives us
         44 px tap targets, proper section dividers, and a layout that
         actually uses the drawer's full width. Mounts only when the
         hamburger opens it. -->
    <Drawer
      v-if="!publicPage"
      :open="mobileNav.isOpen.value"
      side="left"
      @cancel="mobileNav.close"
    >
      <SidebarDrawer @click="onDrawerNavClick" />
    </Drawer>

    <main
      id="main"
      ref="mainEl"
      tabindex="-1"
      class="relative flex-1 flex flex-col min-w-0 min-h-0 outline-none"
    >
      <UpgradeBanner v-if="authStore.isLoggedIn" />
      <router-view />
      <!-- 4.0 3.5: the play queue keeps playing while you browse. -->
      <MiniPlayer v-if="authStore.isLoggedIn" />
      <shell
        v-if="
          enableExec && authStore.isLoggedIn && authStore.user?.perm.execute
        "
      />
    </main>

    <prompts />
    <upload-files />
    <TransferDock />
    <Slideshow />
    <PhotoMap v-if="mapEnabled" />
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { useFileStore } from "@/stores/file";
import { useUploadStore } from "@/stores/upload";
import Sidebar from "@/components/Sidebar.vue";
import SidebarDrawer from "@/components/SidebarDrawer.vue";
import Prompts from "@/components/prompts/Prompts.vue";
import Shell from "@/components/Shell.vue";
import UploadFiles from "@/components/prompts/UploadFiles.vue";
import TransferDock from "@/components/files/TransferDock.vue";
import MiniPlayer from "@/components/files/MiniPlayer.vue";
import Slideshow from "@/components/files/Slideshow.vue";
// Leaflet loads only when the map is first opened.
const PhotoMap = defineAsyncComponent(
  () => import("@/components/files/PhotoMap.vue")
);
import Drawer from "@/components/Drawer.vue";
import UpgradeBanner from "@/components/UpgradeBanner.vue";
import { useMobileNav } from "@/composables/useMobileNav";
import { enableExec, mapEnabled } from "@/utils/constants";
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";

const layoutStore = useLayoutStore();
const authStore = useAuthStore();
const fileStore = useFileStore();
const uploadStore = useUploadStore();
const route = useRoute();
const mobileNav = useMobileNav();
/** A visitor (not signed in) on a public share page. */
const publicPage = computed(
  () => route.name === "Share" && !authStore.isLoggedIn
);

// NOTE: there is intentionally no "swipe in from the left edge to open the
// drawer" gesture. That rightward edge-swipe is reserved by iOS Safari and
// Android for browser/OS back-navigation and can't be reliably overridden by
// a web page, so it fought the back gesture. The hamburger opens the drawer;
// swiping the OPEN drawer left to close it (in Drawer.vue) is a leftward
// gesture and doesn't collide with the browser.

// Auto-close the mobile drawer when the user clicks a nav item inside it
// (sidebar links push routes; the route watcher below also closes, but
// catching the click first is snappier visually).
const onDrawerNavClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    target.closest("a, button[role='link'], button[type='button']")
  ) {
    mobileNav.close();
  }
};

// Top progress-bar % now reads through uploadStore.displayedPercent
// (v1.3 H10) so the bar doesn't visually regress when more files
// are queued mid-upload. The inline computed that previously lived
// here was removed — the store owns the calculation now.

watch(route, () => {
  fileStore.selected = [];
  fileStore.multiple = false;
  if (layoutStore.currentPromptName !== "success") {
    layoutStore.closeHovers();
  }
  // Close the mobile drawer whenever navigation occurs — covers cases
  // where the user picks a sidebar item, hits browser back, etc.
  mobileNav.close();
});

// Skip link (7.1): move focus into the main area, so the next Tab starts
// there instead of at the top of the sidebar.
const mainEl = ref<HTMLElement | null>(null);
const skipToMain = () => mainEl.value?.focus();

// When the focused element is removed (a folder opened from the keyboard,
// a row that was deleted, a closed panel that didn't hand focus back),
// the browser drops focus to <body> and the next Tab starts from the top.
// Catch that and land in the main area instead (7.1: focus never lost).
const onFocusOut = (e: FocusEvent) => {
  const lost = e.target as HTMLElement | null;
  if (e.relatedTarget || !lost) return;
  setTimeout(() => {
    if (lost.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    // Inside an open dialog or panel, stay in it.
    const dialogs = document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [aria-modal="true"]'
    );
    const dialog = dialogs[dialogs.length - 1];
    const target = dialog
      ? (dialog.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? dialog)
      : mainEl.value;
    target?.focus({ preventScroll: true });
  }, 0);
};
onMounted(() => document.addEventListener("focusout", onFocusOut));
onBeforeUnmount(() => document.removeEventListener("focusout", onFocusOut));
</script>
