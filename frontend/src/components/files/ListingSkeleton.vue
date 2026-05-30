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

    <div v-else class="listing-skeleton__grid">
      <div
        v-for="i in count"
        :key="i"
        class="listing-skeleton__tile"
        :style="{ animationDelay: `${i * 35}ms` }"
      >
        <Skeleton width="100%" height="100%" radius="10" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton.vue";

withDefaults(
  defineProps<{
    /** "list" mirrors the list-mode row layout; "mosaic" renders a tile grid. */
    mode?: "list" | "mosaic";
    /** How many skeleton items to render. */
    count?: number;
  }>(),
  { mode: "list", count: 8 }
);

// Vary filename-bar widths slightly so the skeleton doesn't look like a
// perfect repeating pattern (more "real").
const NAME_WIDTHS = ["220px", "160px", "280px", "200px", "180px", "240px"];
const randomName = (i: number) => NAME_WIDTHS[i % NAME_WIDTHS.length];
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
  grid-template-columns: 28px minmax(0, 1fr) 130px 90px 32px;
  gap: 12px;
  height: 40px;
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

/* Mosaic mode — grid of tiles, matches real grid view shape. */
.listing-skeleton__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  padding: 6px;
}

.listing-skeleton__tile {
  aspect-ratio: 1 / 1;
  animation: row-fade-in 260ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
}
</style>
