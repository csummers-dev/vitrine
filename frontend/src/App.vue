<template>
  <div>
    <router-view></router-view>
    <CommandPalette v-if="isLoggedIn" />
    <ShortcutsOverlay v-if="isLoggedIn" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { setHtmlLocale } from "./i18n";
import { useAuthStore } from "@/stores/auth";
import { useCommandPalette } from "@/composables/useCommandPalette";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";
import { installShortcuts, useShortcuts } from "@/composables/useShortcuts";
import { useThemeBootstrap } from "@/composables/useThemePreference";
import CommandPalette from "@/components/CommandPalette.vue";
import ShortcutsOverlay from "@/components/ShortcutsOverlay.vue";

const { locale } = useI18n();
const router = useRouter();

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const palette = useCommandPalette();
const overlay = useShortcutsOverlay();
const { register } = useShortcuts();

// Initializes the theme on mount: loads the user's stored Light/Dark/System
// preference, applies it, and starts watching the OS color-scheme setting
// so "System" updates live without a refresh.
useThemeBootstrap();

// Install the global shortcut dispatcher (window-level listener). Idempotent.
installShortcuts();

// App-wide shortcuts. Per-view shortcuts (1/2/3 view modes, n/u file
// actions) register themselves from FileListing.vue.
register({
  id: "global:help",
  keys: "?",
  label: "Show keyboard shortcuts",
  group: "help",
  handler: () => overlay.open(),
});
register({
  id: "global:palette",
  keys: "/",
  label: "Open command palette",
  group: "navigation",
  handler: () => palette.open(),
});
register({
  id: "global:files",
  keys: ["g", "f"],
  label: "Go to files",
  group: "navigation",
  handler: () => router.push("/files/"),
});
register({
  id: "global:settings",
  keys: ["g", "s"],
  label: "Go to settings",
  group: "navigation",
  handler: () => router.push("/settings/profile"),
});

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
  setHtmlLocale(locale.value);
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

// handles ltr/rtl changes
watch(locale, (newValue) => {
  newValue && setHtmlLocale(newValue);
});
</script>
