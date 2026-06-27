<template>
  <div>
    <router-view></router-view>
    <CommandPalette v-if="isLoggedIn" />
    <ShortcutsOverlay v-if="isLoggedIn" />
    <!-- Favorites display-title editor, mounted globally so it can open from
         the always-present sidebar context menu (and the file listing). Driven
         by the useFavoriteTitleDialog singleton; renders its own modal scrim. -->
    <FavoriteTitleDialog v-if="isLoggedIn" />
    <!-- Files-root ("My files") label editor, opened from the sidebar
         quick-link's right-click menu via the useRootLabel singleton. -->
    <RootLabelDialog v-if="isLoggedIn" />
    <!-- Password prompt for extracting password-protected archives. Opened
         (detect-&-prompt) by useExtractIndicator via the useArchivePassword
         singleton when the server reports an archive needs a password. -->
    <ArchivePasswordPrompt v-if="isLoggedIn" />
    <!-- S6-4: global offline indicator — shown on every surface,
         including login, independent of auth + the service worker. -->
    <OfflineBanner />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useCommandPalette } from "@/composables/useCommandPalette";
import { installShortcuts } from "@/composables/useShortcuts";
import { useThemeBootstrap } from "@/composables/useThemePreference";
import { useBackgroundGradientBootstrap } from "@/composables/useBackgroundGradient";
import { useAccentColorBootstrap } from "@/composables/useAccentColor";
import CommandPalette from "@/components/CommandPalette.vue";
import ShortcutsOverlay from "@/components/ShortcutsOverlay.vue";
import OfflineBanner from "@/components/OfflineBanner.vue";
import FavoriteTitleDialog from "@/components/files/FavoriteTitleDialog.vue";
import RootLabelDialog from "@/components/files/RootLabelDialog.vue";
import ArchivePasswordPrompt from "@/components/files/ArchivePasswordPrompt.vue";

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const palette = useCommandPalette();

// Initializes the theme on mount: loads the user's stored Light/Dark/System
// preference, applies it, and starts watching the OS color-scheme setting
// so "System" updates live without a refresh.
useThemeBootstrap();

// Apply the user's saved ambient accent-mesh background prefs (intensity +
// translucent sidebar). Sets data-attributes on <html>; styles.css does the
// rest. Per-user, prefs bag — defaults match the CSS defaults (subtle +
// translucent) so the common case has no flash before this runs.
useBackgroundGradientBootstrap();

// Apply the user's saved accent hue (Calm Minimal). Writes the accent source
// vars on <html>; tokens.css derives the rest. Default Violet matches the CSS.
useAccentColorBootstrap();

// Install the global shortcut dispatcher (window-level listener). Idempotent.
installShortcuts();

// WS10: all bare-key + chord shortcuts were removed. The command palette is the
// home for those actions now (⌘K, below). The only keys the app still owns are
// the listing-navigation set (handled directly in FileListing's keydown) and the
// preview page-turn keys (handled in Preview). The shortcuts cheat-sheet is
// opened from the palette ("Keyboard shortcuts") rather than a `?` key.

// Global ⌘K / Ctrl+K → toggle palette. Fires even when an input is focused;
// that's the expected behavior in tools like Linear / Raycast / VS Code.
const onGlobalKeydown = (event: KeyboardEvent) => {
  const isCmdK =
    (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
  if (!isCmdK) return;
  // Only meaningful when logged in.
  if (!isLoggedIn.value) return;
  event.preventDefault();
  palette.toggle();
};

onMounted(() => {
  // English is the only supported language.
  document.documentElement.lang = "en";
  window.addEventListener("keydown", onGlobalKeydown);
  // this might be null during HMR
  const loading = document.getElementById("loading");
  loading?.classList.add("done");

  setTimeout(function () {
    loading?.parentNode?.removeChild(loading);
  }, 200);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});
</script>
