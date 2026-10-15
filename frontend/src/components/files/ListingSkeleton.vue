<template>
  <!-- Renders N skeleton "rows" that match the real ListingItem dimensions.
       Only the list-mode shape is mirrored; mosaic/gallery callers can pass
       a different `count` and let the grid wrap the rectangles. -->
  <div class="listing-skeleton" :class="`mode-${mode}`" aria-hidden="true">
    <template v-if="mode === 'list'">
      <div
        v-for="i in count"
        :key="i"
        class="listing-skeleton__row"
        :style="{ animationDelay: `${i * 35}ms` }"
      >
        <Skeleton :width="14" :height="14" radius="3" />
        <Skeleton :width="28" :height="28" radius="6" />
        <Skeleton :width="randomName(i)" :height="12" />
        <Skeleton :width="60" :height="11" />
        <Skeleton :width="44" :height="11" />
      </div>
    </template>

    <div v-else-if="mode === 'mosaic'" class="listing-skeleton__grid">
      <div
        v-for="i in count"
        :key="i"
        class="listing-skeleton__icon"
        :style="{ animationDelay: `${i * 35}ms` }"
      >
        <Skeleton :width="72" :height="72" radius="14" />
        <Skeleton :width="randomShort(i)" :height="11" />
        <Skeleton :width="36" :height="10" />
      </div>
    </div>

    <div v-else class="listing-skeleton__grid listing-skeleton__grid--gallery">
      <div
        v-for="i in count"
        :key="i"
        class="listing-skeleton__tile"
        :style="{ animationDelay: `${i * 35}ms` }"
      >
        <Skeleton width="100%" height="100%" radius="14" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton.vue";

withDefaults(
  defineProps<{
    /** The view being loaded: list rows, Icons tiles or Gallery cards. */
    mode?: "list" | "mosaic" | "gallery";
    /** How many skeleton items to render. */
    count?: number;
  }>(),
  { mode: "list", count: 8 }
);

// Vary filename-bar widths slightly so the skeleton doesn't look like a
// perfect repeating pattern (more "real").
const NAME_WIDTHS = ["220px", "160px", "280px", "200px", "180px", "240px"];
const randomName = (i: number) => NAME_WIDTHS[i % NAME_WIDTHS.length];
const SHORT_WIDTHS = ["70px", "56px", "84px", "64px"];
const randomShort = (i: number) => SHORT_WIDTHS[i % SHORT_WIDTHS.length];
</script>

<style scoped>
.listing-skeleton {
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.listing-skeleton__row {
  /* Mirrors `#listing.list .item` 5-col grid template */
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 120px 80px 32px;
  gap: 12px;
  height: 44px;
  padding: 0 6px;
  align-items: center;
  /* Subtle stagger so rows appear in sequence — feels more "loading" than
     "static placeholder". */
  animation: row-fade-in 240ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
}

@keyframes row-fade-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 700px) {
  .listing-skeleton__row {
    grid-template-columns: 28px minmax(0, 1fr) 110px 32px;
  }
  .listing-skeleton__row > :nth-child(5) {
    display: none;
  }
}

@media (max-width: 540px) {
  .listing-skeleton__row {
    grid-template-columns: 28px minmax(0, 1fr) 32px;
    gap: 8px;
  }
  .listing-skeleton__row > :nth-child(4) {
    display: none;
  }
}

/* Icons and Gallery: the same tracks as the real views (listing.css). */
.listing-skeleton__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 12px;
  padding: 6px;
}
.listing-skeleton__grid--gallery {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
@media (max-width: 520px) {
  .listing-skeleton__grid--gallery {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

.listing-skeleton__icon {
  height: 156px;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: row-fade-in 260ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
}

.listing-skeleton__tile {
  aspect-ratio: 4 / 3;
  animation: row-fade-in 260ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
}
</style>
