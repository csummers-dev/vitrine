<template>
  <span class="brand-name">
    <template v-for="(part, i) in parts" :key="i">
      <span v-if="part.accent" class="brand-name__pretty">{{ part.text }}</span>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: string }>();

/**
 * Brand accent: when a string matches the app's wordmark
 * "filebrowser pretty" (case-insensitive, surrounding whitespace ignored),
 * the trailing word "pretty" is rendered in the current theme's accent
 * color. The user's actual casing is preserved for every part — we only
 * tint the matching slice.
 *
 * This is THE branding of the app, not a hidden easter egg: the sidebar
 * uses it for the workspace title and new installs default the instance
 * name to this wordmark. Theme-adaptive on purpose so the accent reads
 * consistently with the rest of the UI on any color theme.
 */
const TRIGGER = "filebrowser pretty";
const ACCENT_WORD = "pretty";

const parts = computed<{ text: string; accent: boolean }[]>(() => {
  const raw = props.name ?? "";
  if (raw.trim().toLowerCase() !== TRIGGER) {
    return [{ text: raw, accent: false }];
  }
  const lower = raw.toLowerCase();
  const idx = lower.indexOf(ACCENT_WORD);
  if (idx === -1) return [{ text: raw, accent: false }];
  return [
    { text: raw.slice(0, idx), accent: false },
    { text: raw.slice(idx, idx + ACCENT_WORD.length), accent: true },
    { text: raw.slice(idx + ACCENT_WORD.length), accent: false },
  ];
});
</script>

<style scoped>
.brand-name {
  /* Inherits everything from the parent text; no own chrome. */
  display: inline;
}

.brand-name__pretty {
  /* Uses the current theme's accent so the wordmark stays cohesive with
     the rest of the UI. Falls back to the default lilac. Weight inherits
     from the surrounding text so the accent doesn't introduce a visual
     "bump" in the type rhythm. */
  color: var(--color-accent, #5e6ad2);
  font-weight: inherit;
}
</style>
