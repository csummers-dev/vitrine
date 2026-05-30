<template>
  <header
    class="h-12 border-b border-line bg-canvas flex items-center px-3 gap-2 shrink-0 sticky top-0 z-10"
  >
    <!-- Hamburger: opens the sidebar drawer on mobile. Only shown below
         sm where the inline sidebar is hidden. -->
    <button
      v-if="showMobileNav"
      type="button"
      class="hidden max-sm:inline-flex w-8 h-8 rounded-md hover:bg-hover items-center justify-center text-ink-2 transition shrink-0 -ml-1"
      aria-label="Open navigation menu"
      title="Open menu"
      @click="mobileNav.open"
    >
      <Icon name="menu" :size="18" />
    </button>

    <!-- Default slot fills the left/center: typically Breadcrumbs + Search -->
    <div class="flex-1 flex items-center gap-2 min-w-0">
      <slot />
    </div>

    <!-- Action buttons. The actions slot collapses to icon-only at narrow
         widths via the children's own max-md utilities; that's enough — no
         overflow More menu needed since the icons fit. The legacy ⋯ trigger
         (which opened nothing) was removed in the Stage 11 polish pass. -->
    <div id="dropdown" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useMobileNav } from "@/composables/useMobileNav";

const props = withDefaults(
  defineProps<{
    showLogo?: boolean;
    showMenu?: boolean;
    /** Render the hamburger that opens the sidebar drawer on mobile.
     *  Defaults to true; set false on shells that don't have a sidebar
     *  (login, public share). */
    showMobileNav?: boolean;
  }>(),
  { showMobileNav: true }
);

const mobileNav = useMobileNav();

// Reference the prop so the linter doesn't trim it
void props;
</script>
