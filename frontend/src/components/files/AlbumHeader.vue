<template>
  <!-- 4.0 3.5: shown above a folder that is mostly audio. -->
  <section
    class="album-header"
    aria-label="Album"
    data-testid="album-header"
    @click.stop
    @mousedown.stop
    @contextmenu.stop
  >
    <img
      v-if="coverIndex < covers.length"
      :src="covers[coverIndex]"
      alt=""
      class="album-header__cover"
      @error="coverIndex++"
    />
    <div v-else class="album-header__cover album-header__cover--fallback">
      <Icon name="disc-3" :size="28" :stroke-width="1.4" />
    </div>
    <div class="album-header__info">
      <div class="album-header__eyebrow">Album</div>
      <h2 class="album-header__title">{{ title }}</h2>
      <div class="album-header__meta">
        {{ tracks.length }} tracks
        <template v-if="totalSize"> · {{ totalSize }}</template>
      </div>
      <div class="album-header__actions">
        <button
          type="button"
          class="album-header__btn album-header__btn--primary"
          @click="$emit('play')"
        >
          <Icon name="play" :size="14" />
          <span>Play</span>
        </button>
        <button
          type="button"
          class="album-header__btn"
          @click="$emit('shuffle')"
        >
          <Icon name="shuffle" :size="14" />
          <span>Shuffle</span>
        </button>
        <button
          type="button"
          class="album-header__btn"
          title="Add to queue"
          aria-label="Add to queue"
          @click="$emit('queue')"
        >
          <Icon name="list-plus" :size="14" />
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import { files as api } from "@/api";
import { filesize } from "@/utils";
import type { Track } from "@/composables/usePlayer";

const props = defineProps<{ folder: Resource; tracks: Track[] }>();
defineEmits<{ play: []; shuffle: []; queue: [] }>();

const title = computed(() => props.folder.name || "My files");

// Folder cover (poster/cover.jpg or album art, 3.2), then the first track's
// embedded art, then a disc icon.
const covers = computed(() => {
  const out = [
    api.getPreviewURL(props.folder as unknown as ResourceItem, "thumb"),
  ];
  const first = props.tracks[0];
  if (first) {
    out.push(
      api.getPreviewURL(
        { path: first.path, modified: first.modified ?? "" } as ResourceItem,
        "thumb"
      )
    );
  }
  return out;
});
const coverIndex = ref(0);
watch(
  () => props.folder.path,
  () => (coverIndex.value = 0)
);

const totalSize = computed(() => {
  const paths = new Set(props.tracks.map((t) => t.path));
  let bytes = 0;
  for (const it of props.folder.items ?? []) {
    if (paths.has(it.path)) bytes += it.size || 0;
  }
  return bytes > 0 ? filesize(bytes) : "";
});
</script>

<style scoped>
.album-header {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 4px 0 12px;
  padding: 14px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-line);
}
.album-header__cover {
  width: 96px;
  height: 96px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: var(--shadow-2);
}
.album-header__cover--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-elevated);
  color: var(--color-ink-3);
}
.album-header__info {
  min-width: 0;
}
.album-header__eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3);
}
.album-header__title {
  margin: 2px 0;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-header__meta {
  font-size: 12px;
  color: var(--color-ink-2);
}
.album-header__actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.album-header__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink-1);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.album-header__btn:hover {
  background: var(--color-elevated);
}
.album-header__btn--primary {
  border-color: transparent;
  background: var(--accent-gradient);
  color: var(--color-on-accent);
}
.album-header__btn--primary:hover {
  background: var(--accent-gradient);
  filter: brightness(1.08);
}
@media (max-width: 767px) {
  .album-header__cover {
    width: 72px;
    height: 72px;
  }
}
</style>
