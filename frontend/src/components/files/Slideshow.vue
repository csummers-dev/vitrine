<template>
  <Teleport to="body">
    <div
      v-if="show.current.value"
      ref="root"
      class="slideshow"
      :class="{ 'slideshow--idle': idle }"
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      tabindex="-1"
      data-testid="slideshow"
      @mousemove="wake"
      @pointerdown="wake"
    >
      <Transition name="slideshow-fade">
        <img
          :key="show.current.value.path"
          :src="urlOf(show.current.value)"
          :alt="show.current.value.name"
          class="slideshow__img"
          @click="show.togglePlay()"
        />
      </Transition>
      <!-- Preload the next slide so the crossfade never waits. -->
      <img
        v-if="show.upcoming.value"
        :src="urlOf(show.upcoming.value)"
        alt=""
        class="slideshow__preload"
        aria-hidden="true"
      />

      <button
        type="button"
        class="slideshow__nav slideshow__nav--prev"
        aria-label="Previous photo"
        @click="show.prev()"
      >
        <Icon name="chevron-left" :size="28" />
      </button>
      <button
        type="button"
        class="slideshow__nav slideshow__nav--next"
        aria-label="Next photo"
        @click="show.next()"
      >
        <Icon name="chevron-right" :size="28" />
      </button>

      <div class="slideshow__bar">
        <span class="slideshow__caption truncate">{{
          show.current.value.name
        }}</span>
        <span
          class="slideshow__counter tabular"
          data-testid="slideshow-counter"
        >
          {{ show.counter.value }}
        </span>
        <div class="slideshow__controls">
          <button
            type="button"
            class="slideshow__btn"
            :aria-label="show.playing.value ? 'Pause' : 'Play'"
            @click="show.togglePlay()"
          >
            <Icon :name="show.playing.value ? 'pause' : 'play'" :size="16" />
          </button>
          <button
            type="button"
            class="slideshow__btn"
            :class="{ 'slideshow__btn--on': show.shuffle.value }"
            :aria-pressed="show.shuffle.value"
            aria-label="Shuffle"
            @click="show.toggleShuffle()"
          >
            <Icon name="shuffle" :size="15" />
          </button>
          <label class="slideshow__interval">
            <span class="sr-only">Seconds per photo</span>
            <select
              :value="show.intervalSec.value"
              @change="
                show.setIntervalSec(
                  Number(($event.target as HTMLSelectElement).value)
                )
              "
            >
              <option v-for="s in SLIDE_INTERVALS" :key="s" :value="s">
                {{ s }}s
              </option>
            </select>
          </label>
          <button
            type="button"
            class="slideshow__btn"
            aria-label="Full screen"
            @click="toggleFullscreen"
          >
            <Icon name="maximize" :size="15" />
          </button>
          <button
            type="button"
            class="slideshow__btn"
            aria-label="Close slideshow"
            @click="close"
          >
            <Icon name="x" :size="16" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import {
  SLIDE_INTERVALS,
  useSlideshow,
  type Slide,
} from "@/composables/useSlideshow";
import { files as api } from "@/api";

const show = useSlideshow();
const root = ref<HTMLElement | null>(null);

// Big previews: resized server-side, and HEIC/AVIF converted to JPEG.
const urlOf = (s: Slide) =>
  api.getPreviewURL(
    { path: s.path, modified: s.modified } as ResourceItem,
    "big"
  );

// Controls fade out after a few seconds without pointer movement.
const IDLE_MS = 2500;
const idle = ref(false);
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const wake = () => {
  idle.value = false;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => (idle.value = true), IDLE_MS);
};

const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void root.value?.requestFullscreen?.().catch(() => {});
};

const close = () => {
  if (document.fullscreenElement)
    void document.exitFullscreen().catch(() => {});
  show.close();
};

const onKey = (e: KeyboardEvent) => {
  if (!show.isOpen.value) return;
  const target = e.target as HTMLElement | null;
  if (target?.tagName === "SELECT") return;
  switch (e.key) {
    case "Escape":
      // The browser leaves full screen on Esc by itself; close only when
      // we weren't in full screen.
      if (!document.fullscreenElement) close();
      break;
    case "ArrowRight":
      show.next();
      break;
    case "ArrowLeft":
      show.prev();
      break;
    case " ":
      show.togglePlay();
      break;
    case "f":
    case "F":
      toggleFullscreen();
      break;
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
  wake();
};

watch(
  () => show.isOpen.value,
  async (open) => {
    if (open) {
      window.addEventListener("keydown", onKey, true);
      wake();
      await nextTick();
      root.value?.focus();
    } else {
      window.removeEventListener("keydown", onKey, true);
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey, true);
  if (idleTimer) clearTimeout(idleTimer);
  show.close();
});
</script>

<style scoped>
.slideshow {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--media-canvas);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  color: var(--media-ink);
}
.slideshow--idle {
  cursor: none;
}
.slideshow__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.slideshow__preload {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.slideshow-fade-enter-active,
.slideshow-fade-leave-active {
  transition: opacity 0.6s ease;
}
.slideshow-fade-enter-from,
.slideshow-fade-leave-to {
  opacity: 0;
}
.slideshow__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--media-chrome-soft);
  color: var(--media-ink);
  cursor: pointer;
  transition: opacity 0.3s ease;
}
.slideshow__nav--prev {
  left: 16px;
}
.slideshow__nav--next {
  right: 16px;
}
.slideshow__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 20px 16px;
  background: var(--media-fade);
  transition: opacity 0.3s ease;
  font-size: 13px;
}
.slideshow--idle .slideshow__bar,
.slideshow--idle .slideshow__nav {
  opacity: 0;
}
.slideshow__caption {
  flex: 1;
  min-width: 0;
}
.slideshow__counter {
  color: var(--media-ink-2);
}
.slideshow__controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.slideshow__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--media-hover);
  color: var(--media-ink);
  cursor: pointer;
}
.slideshow__btn:hover {
  background: var(--media-active);
}
.slideshow__btn--on {
  background: var(--media-active);
}
.slideshow__interval select {
  height: 34px;
  border: 0;
  border-radius: var(--radius-md);
  padding: 0 8px;
  background: var(--media-hover);
  color: var(--media-ink);
  font: inherit;
}
.slideshow__interval option {
  color: var(--media-canvas);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
