<template>
  <span class="brand-name">
    <template v-for="(part, i) in parts" :key="i">
      <!-- The wordmark's trailing "pretty" renders one letter per accent
           color (lilac → blue → teal → green → orange → red). -->
      <template v-if="part.accent">
        <span
          v-for="(ch, j) in part.chars"
          :key="j"
          class="brand-name__ltr"
          :class="`brand-name__ltr--${j % 6}`"
          >{{ ch }}</span
        >
      </template>
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
 * the trailing word "pretty" is rendered with a different accent color per
 * letter — lilac, blue, teal, green, orange, red, in order — cycling if the
 * matched slice runs longer than six characters. The user's actual casing is
 * preserved; we only colorize the matching slice.
 *
 * This is THE branding of the app, not a hidden easter egg: the sidebar
 * uses it for the workspace title and new installs default the instance
 * name to this wordmark. Theme-adaptive so the colors read on light + dark.
 */
const TRIGGER = "filebrowser pretty";
const ACCENT_WORD = "pretty";

const parts = computed<{ text: string; accent: boolean; chars: string[] }[]>(
  () => {
    const raw = props.name ?? "";
    if (raw.trim().toLowerCase() !== TRIGGER) {
      return [{ text: raw, accent: false, chars: [] }];
    }
    const lower = raw.toLowerCase();
    const idx = lower.indexOf(ACCENT_WORD);
    if (idx === -1) return [{ text: raw, accent: false, chars: [] }];
    const accentSlice = raw.slice(idx, idx + ACCENT_WORD.length);
    return [
      { text: raw.slice(0, idx), accent: false, chars: [] },
      { text: accentSlice, accent: true, chars: [...accentSlice] },
      { text: raw.slice(idx + ACCENT_WORD.length), accent: false, chars: [] },
    ];
  }
);
</script>

<style scoped>
.brand-name {
  /* The wordmark is always bold wherever it's printed — sidebar, drawer, login
     title, and inline within sentences ("Sign in to filebrowser pretty"). It
     still inherits size / color / family from the surrounding text. */
  display: inline;
  font-weight: 700;
}

/* Per-letter accent. Weight inherits from `.brand-name` (bold) so the colored
   letters stay in the same weight as the rest of the wordmark — no visual
   "bump" in the type rhythm. Light values below; the html.dark overrides lift
   them for the dark canvas. */
.brand-name__ltr {
  font-weight: inherit;
}
.brand-name__ltr--0 {
  color: #5e6ad2;
} /* lilac */
.brand-name__ltr--1 {
  color: #3b82f6;
} /* blue */
.brand-name__ltr--2 {
  color: #0d9488;
} /* teal */
.brand-name__ltr--3 {
  color: #16a34a;
} /* green */
.brand-name__ltr--4 {
  color: #d97706;
} /* orange */
.brand-name__ltr--5 {
  color: #e11d48;
} /* red */

/* Lilac is the brand primary and reads well on light AND dark, so it keeps its
   base #5e6ad2 in dark (no override) — unlike the other five, which lift to
   lighter tones for contrast on the dark canvas. */
:global(html.dark) .brand-name__ltr--1 {
  color: #93c5fd;
}
:global(html.dark) .brand-name__ltr--2 {
  color: #2dd4bf;
}
:global(html.dark) .brand-name__ltr--3 {
  color: #4ade80;
}
:global(html.dark) .brand-name__ltr--4 {
  color: #fbbf24;
}
:global(html.dark) .brand-name__ltr--5 {
  color: #fb7185;
}
</style>
