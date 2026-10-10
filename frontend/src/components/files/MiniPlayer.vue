<template>
  <section
    v-if="player.current.value"
    class="mini-player"
    :class="{ 'mini-player--open': queueOpen }"
    aria-label="Now playing"
    data-testid="mini-player"
  >
    <!-- Queue (expands upward). -->
    <div v-if="queueOpen" class="mini-player__queue">
      <div class="mini-player__queue-head">
        <span>Queue · {{ player.queue.value.length }}</span>
        <button type="button" class="mini-player__link" @click="clearQueue">
          Clear
        </button>
      </div>
      <ol class="mini-player__list">
        <li
          v-for="(t, i) in player.queue.value"
          :key="`${i}:${t.path}`"
          class="mini-player__row"
          :class="{
            'mini-player__row--current': i === player.currentIndex.value,
          }"
        >
          <button
            type="button"
            class="mini-player__row-btn"
            :title="t.path"
            @click="player.playAt(i)"
          >
            <span class="mini-player__row-num tabular">{{ i + 1 }}</span>
            <span class="truncate">{{ trackTitle(t.name) }}</span>
          </button>
          <button
            type="button"
            class="mini-player__icon-btn"
            :aria-label="`Remove ${t.name} from the queue`"
            @click="player.removeAt(i)"
          >
            <Icon name="x" :size="12" />
          </button>
        </li>
      </ol>
    </div>

    <div class="mini-player__bar">
      <img
        v-if="!coverError"
        :src="coverUrl"
        alt=""
        class="mini-player__cover"
        @error="coverError = true"
      />
      <div v-else class="mini-player__cover mini-player__cover--fallback">
        <Icon name="music" :size="16" />
      </div>

      <button
        type="button"
        class="mini-player__meta"
        :title="player.current.value.path"
        @click="openFolder"
      >
        <span class="mini-player__title truncate">{{
          trackTitle(player.current.value.name)
        }}</span>
        <span class="mini-player__sub truncate">{{ folderName }}</span>
      </button>

      <div class="mini-player__controls">
        <button
          type="button"
          class="mini-player__icon-btn"
          aria-label="Previous track"
          @click="player.prev()"
        >
          <Icon name="skip-back" :size="14" />
        </button>
        <button
          type="button"
          class="mini-player__icon-btn mini-player__play"
          :aria-label="player.playing.value ? 'Pause' : 'Play'"
          @click="player.toggle()"
        >
          <Icon :name="player.playing.value ? 'pause' : 'play'" :size="16" />
        </button>
        <button
          type="button"
          class="mini-player__icon-btn"
          aria-label="Next track"
          @click="player.next()"
        >
          <Icon name="skip-forward" :size="14" />
        </button>
        <button
          type="button"
          class="mini-player__icon-btn"
          :class="{ 'mini-player__icon-btn--on': player.shuffle.value }"
          :aria-pressed="player.shuffle.value"
          aria-label="Shuffle"
          title="Shuffle"
          @click="player.toggleShuffle()"
        >
          <Icon name="shuffle" :size="13" />
        </button>
        <button
          type="button"
          class="mini-player__icon-btn"
          :class="{
            'mini-player__icon-btn--on': player.repeat.value !== 'off',
          }"
          :aria-label="repeatLabel"
          :title="repeatLabel"
          @click="player.cycleRepeat()"
        >
          <Icon
            :name="player.repeat.value === 'one' ? 'repeat-1' : 'repeat'"
            :size="13"
          />
        </button>
        <button
          type="button"
          class="mini-player__icon-btn"
          :class="{ 'mini-player__icon-btn--on': queueOpen }"
          :aria-expanded="queueOpen"
          aria-label="Queue"
          title="Queue"
          @click="queueOpen = !queueOpen"
        >
          <Icon name="list-music" :size="13" />
        </button>
        <button
          type="button"
          class="mini-player__icon-btn"
          aria-label="Stop and close the player"
          title="Close"
          @click="clearQueue"
        >
          <Icon name="x" :size="13" />
        </button>
      </div>

      <button
        type="button"
        class="mini-player__progress"
        :aria-label="`Seek · ${formatTimestamp(player.currentTime.value)} of ${formatTimestamp(player.duration.value)}`"
        @click="onSeek"
      >
        <span
          class="mini-player__progress-fill"
          :style="{ width: `${progressPct}%` }"
        />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import { usePlayer } from "@/composables/usePlayer";
import { formatTimestamp } from "@/composables/useVideoProgress";
import { files as api } from "@/api";

const player = usePlayer();
const router = useRouter();
const queueOpen = ref(false);
const coverError = ref(false);

const trackTitle = (name: string) => name.replace(/\.[^.]+$/, "");

const folderPath = computed(() => {
  const p = player.current.value?.path ?? "";
  return p.slice(0, p.lastIndexOf("/")) || "/";
});
const folderName = computed(
  () => folderPath.value.split("/").filter(Boolean).pop() ?? "My files"
);

// The track's embedded art (server thumb); a music icon when it has none.
const coverUrl = computed(() => {
  const t = player.current.value;
  if (!t) return "";
  return api.getPreviewURL(
    { path: t.path, modified: t.modified ?? "" } as ResourceItem,
    "thumb"
  );
});
watch(coverUrl, () => (coverError.value = false));

const progressPct = computed(() =>
  player.duration.value > 0
    ? Math.min(100, (player.currentTime.value / player.duration.value) * 100)
    : 0
);

const repeatLabel = computed(
  () =>
    ({ off: "Repeat: off", all: "Repeat: all", one: "Repeat: this track" })[
      player.repeat.value
    ]
);

const onSeek = (e: MouseEvent) => {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  player.seek(ratio * player.duration.value);
};

const openFolder = () => {
  const enc = folderPath.value
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  void router.push(`/files${enc}${enc.endsWith("/") ? "" : "/"}`);
};

const clearQueue = () => {
  queueOpen.value = false;
  player.clear();
};
</script>

<style scoped>
.mini-player {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 40;
  width: min(380px, calc(100% - 32px));
  border-radius: var(--radius-lg, 12px);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  box-shadow: 0 16px 36px -12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  color: var(--color-ink-1, #18181b);
}
.mini-player__bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 10px;
}
.mini-player__cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}
.mini-player__cover--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
}
.mini-player__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.mini-player__title {
  max-width: 100%;
  font-size: 13px;
  font-weight: 600;
}
.mini-player__sub {
  max-width: 100%;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}
.mini-player__controls {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}
.mini-player__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
}
.mini-player__icon-btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.mini-player__icon-btn--on {
  color: var(--color-accent, #6e72d9);
}
.mini-player__play {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-gradient, #6e72d9);
  color: #fff;
}
.mini-player__play:hover {
  background: var(--accent-gradient, #6e72d9);
  color: #fff;
  filter: brightness(1.08);
}
.mini-player__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  padding: 0;
  border: 0;
  background: var(--color-line, #ececec);
  cursor: pointer;
}
.mini-player__progress-fill {
  display: block;
  height: 100%;
  background: var(--color-accent, #6e72d9);
}
.mini-player__queue {
  border-bottom: 1px solid var(--color-line, #ececec);
  max-height: 260px;
  display: flex;
  flex-direction: column;
}
.mini-player__queue-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}
.mini-player__link {
  border: 0;
  background: none;
  font: inherit;
  color: var(--color-accent, #6e72d9);
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.mini-player__list {
  list-style: none;
  margin: 0;
  padding: 0 4px 6px;
  overflow-y: auto;
}
.mini-player__row {
  display: flex;
  align-items: center;
  border-radius: 6px;
}
.mini-player__row:hover {
  background: var(--color-elevated, #f4f4f5);
}
.mini-player__row--current {
  color: var(--color-accent, #6e72d9);
  font-weight: 600;
}
.mini-player__row-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.mini-player__row-num {
  width: 20px;
  flex-shrink: 0;
  color: var(--color-ink-3, #a1a1aa);
  font-weight: 400;
}
@media (max-width: 767px) {
  .mini-player {
    left: 8px;
    right: 8px;
    bottom: 8px;
    width: auto;
  }
}
</style>
