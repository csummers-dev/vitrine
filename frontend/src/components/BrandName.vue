<template>
  <span class="brand-name">
    <template v-for="(part, i) in parts" :key="i">
      <!-- The wordmark "vitrine" renders one letter per accent
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
 * Brand accent: when a string matches the app's wordmark "vitrine"
 * (case-insensitive, surrounding whitespace ignored), every letter is
 * rendered with a different accent color — lilac, blue, teal, green,
 * orange, red, in order — cycling if the word runs longer than six
 * characters. The user's actual casing is preserved; we only colorize
 * the matching slice.
 *
 * This is THE branding of the app, not a hidden easter egg: the sidebar
 * uses it for the workspace title and new installs default the instance
 * name to this wordmark. Theme-adaptive so the colors read on light + dark.
 */
const TRIGGER = "vitrine";

const parts = computed<{ text: string; accent: boolean; chars: string[] }[]>(
  () => {
    const raw = props.name ?? "";
    if (raw.trim().toLowerCase() !== TRIGGER) {
      return [{ text: raw, accent: false, chars: [] }];
    }
    // Colorize the non-whitespace core, preserving any surrounding space.
    const idx = raw.indexOf(raw.trim());
    const core = raw.trim();
    return [
      { text: raw.slice(0, idx), accent: false, chars: [] },
      { text: core, accent: true, chars: [...core] },
      { text: raw.slice(idx + core.length), accent: false, chars: [] },
    ];
  }
);
</script>

<style scoped>
.brand-name {
  /* The wordmark is always bold wherever it's printed — sidebar, drawer, login
     title, and inline within sentences ("Sign in to vitrine"). It
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
  color: #545aae;
} /* lilac */
.brand-name__ltr--1 {
  color: #4a6da3;
} /* blue */
.brand-name__ltr--2 {
  color: #35786c;
} /* teal */
.brand-name__ltr--3 {
  color: #4d7a4e;
} /* green */
.brand-name__ltr--4 {
  color: #9c5f45;
} /* orange */
.brand-name__ltr--5 {
  color: #a84e4e;
} /* red */

/* Dusty palette (v2.7): the light values above are deep enough for the light
   canvas, so every letter — lilac included — lifts to its dusty pastel in
   dark. */
:global(html.dark) .brand-name__ltr--0 {
  color: #a9aede;
}
:global(html.dark) .brand-name__ltr--1 {
  color: #a3bede;
}
:global(html.dark) .brand-name__ltr--2 {
  color: #93c4ba;
}
:global(html.dark) .brand-name__ltr--3 {
  color: #a3c4a4;
}
:global(html.dark) .brand-name__ltr--4 {
  color: #d3a58e;
}
:global(html.dark) .brand-name__ltr--5 {
  color: #dda0a0;
}
</style>
