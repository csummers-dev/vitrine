<template>
  <div class="app-shell flex overflow-hidden bg-canvas text-ink-1">
    <!-- Ambient accent-mesh background (per-user; mirrors the login screen).
         Sits on the canvas behind all in-flow content; visibility + intensity
         are driven by data-attributes on <html> (useBackgroundGradient). -->
    <div class="app-mesh" aria-hidden="true"></div>

    <!-- Skip-to-content link: invisible until focused via Tab. Must be the
         first focusable element so a keyboard user reaches it before the
         sidebar's full nav tree. -->
    <a href="#main" class="skip-link">Skip to content</a>

    <div v-if="uploadStore.totalBytes" class="progress">
      <!-- Width drives off the store's displayedPercent (v1.3 H10) —
           a phantom-counter-backed value that doesn't regress when
           files are added to an in-progress queue. -->
      <div :style="{ width: uploadStore.displayedPercent + '%' }"></div>
    </div>

    <!-- Inline sidebar — visible at sm+ (640px). Hidden below sm; the
         drawer instance below takes over for mobile. -->
    <sidebar class="max-sm:hidden" />

    <!-- Mobile drawer — purpose-built SidebarDrawer (not the inline
         Sidebar). The inline Sidebar's responsive max-md icon-rail
         layout is wrong for a drawer; a dedicated component gives us
         44 px tap targets, proper section dividers, and a layout that
         actually uses the drawer's full width. Mounts only when the
         hamburger opens it. -->
    <Drawer
      :open="mobileNav.isOpen.value"
      side="left"
      @cancel="mobileNav.close"
    >
      <SidebarDrawer @click="onDrawerNavClick" />
    </Drawer>

    <main id="main" class="flex-1 flex flex-col min-w-0 min-h-0">
      <router-view />
      <shell
        v-if="
          enableExec && authStore.isLoggedIn && authStore.user?.perm.execute
        "
      />
    </main>

    <prompts />
    <upload-files />
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
import Drawer from "@/components/Drawer.vue";
import { useMobileNav } from "@/composables/useMobileNav";
import { enableExec } from "@/utils/constants";
import { watch } from "vue";
import { useRoute } from "vue-router";

const layoutStore = useLayoutStore();
const authStore = useAuthStore();
const fileStore = useFileStore();
const uploadStore = useUploadStore();
const route = useRoute();
const mobileNav = useMobileNav();

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
</script>
