<template>
  <div class="video-viewer">
    <!-- Fallback card: native playback failed AND (transcoding is off, or
         the transcoded stream also failed). Offer download / open. -->
    <div v-if="failed" class="video-viewer__fallback">
      <Icon name="film" :size="28" :stroke-width="1.4" />
      <div class="video-viewer__fallback-title">Can’t play this video here</div>
      <div class="video-viewer__fallback-hint">
        This format can’t be decoded in the browser{{
          transcodeEnabled ? " — transcoding also failed" : ""
        }}. Download it to watch in a desktop player.
      </div>
      <div class="video-viewer__fallback-actions">
        <a
          v-if="downloadUrl"
          :href="downloadUrl"
          target="_blank"
          rel="noopener"
          class="video-viewer__btn video-viewer__btn--primary"
        >
          <Icon name="download" :size="14" />
          <span>Download</span>
        </a>
        <a
          v-if="directUrl"
          :href="directUrl"
          target="_blank"
          rel="noopener"
          class="video-viewer__btn video-viewer__btn--ghost"
        >
          <Icon name="external-link" :size="14" />
          <span>Open</span>
        </a>
      </div>
    </div>

    <div v-else class="video-viewer__frame">
      <VideoPlayer
        ref="player"
        :key="effectiveSource"
        :source="effectiveSource"
        :subtitles="subtitles"
        :options="options"
        :default-subtitle="defaultSubtitle"
      />
      <!-- Shown while the server prepares a transcoded stream (this format
           can't be decoded natively). A remux is near-instant; a full
           re-encode of a long/HEVC file takes minutes — the elapsed timer
           keeps it from looking hung. -->
      <div v-if="preparing" class="video-viewer__preparing">
        <Icon name="loader-circle" :size="22" class="video-viewer__spin" />
        <span class="video-viewer__preparing-title">
          Converting video for playback…
        </span>
        <span class="video-viewer__preparing-sub">
          Your browser can’t play this format directly, so the server is
          transcoding it. Large or high-efficiency (HEVC/4K) files can take a
          few minutes — it’ll start on its own when ready.
        </span>
        <span class="video-viewer__preparing-timer">{{ elapsedLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import VideoPlayer from "@/components/files/VideoPlayer.vue";
import Icon from "@/components/Icon.vue";
import { transcodeEnabled } from "@/utils/constants";

/** Metadata surfaced once the underlying <video> reports loadedmetadata.
 *  Used by Preview.vue to populate the info-rail "Tracks" section. */
export interface VideoMeta {
  width: number;
  height: number;
  duration: number;
  textTracks: number;
}

const props = defineProps<{
  source: string;
  subtitles?: string[];
  options?: any;
  /** S5-7: URL of the subtitle track to show by default. */
  defaultSubtitle?: string;
  /** #3: transcode endpoint URL; loaded when native playback fails. */
  transcodeSource?: string;
  /** When true, skip the native attempt and load the transcode stream
   *  straight away — for containers browsers can't decode at all (.avi,
   *  .mkv, …), where waiting for a (often non-firing) <video> error event
   *  before transcoding just leaves a dead player. */
  preferTranscode?: boolean;
  /** Download / open URLs for the can't-play fallback card. */
  downloadUrl?: string;
  directUrl?: string;
}>();

// On-demand transcode fallback (#3): start on the original source; if the
// browser can't decode it, swap to the transcoded stream; if THAT also
// fails (or there's no transcode), show the download card.
const useTranscode = ref(false);
// Start in the "preparing" state when we're going straight to the
// transcode stream (preferTranscode) — the overlay shows until the
// transcoded stream reports loadedmetadata.
const preparing = ref(false);
const failed = ref(false);

// Elapsed-time readout for the transcode overlay. A full re-encode blocks
// until ffmpeg finishes the whole file (the endpoint uses +faststart, so
// nothing plays until it's done), which can be minutes — a ticking timer
// signals "still working" instead of "frozen".
const elapsedSec = ref(0);
let prepTimer: ReturnType<typeof setInterval> | null = null;
let prepStartedAt = 0;

const stopPrepTimer = () => {
  if (prepTimer !== null) {
    clearInterval(prepTimer);
    prepTimer = null;
  }
};
const startPrepTimer = () => {
  stopPrepTimer();
  prepStartedAt = Date.now();
  elapsedSec.value = 0;
  prepTimer = setInterval(() => {
    elapsedSec.value = Math.floor((Date.now() - prepStartedAt) / 1000);
  }, 1000);
};

const elapsedLabel = computed(() => {
  const m = Math.floor(elapsedSec.value / 60);
  const s = elapsedSec.value % 60;
  return `${m}:${String(s).padStart(2, "0")} elapsed`;
});

// Run the timer exactly while the preparing overlay is visible.
watch(preparing, (now) => {
  if (now) startPrepTimer();
  else stopPrepTimer();
});

// Are we (about to be) playing the transcoded stream? True either because
// the container is known-unplayable (preferTranscode) or because the native
// source already errored and we escalated (useTranscode).
const usingTranscode = computed(
  () =>
    (useTranscode.value || !!props.preferTranscode) && !!props.transcodeSource
);

const effectiveSource = computed(() =>
  usingTranscode.value ? props.transcodeSource! : props.source
);

const emit = defineEmits<{
  (e: "metadata", meta: VideoMeta): void;
  /** Picture-in-Picture availability + state (v1.3 S5-8). Emitted on
   *  attach and whenever PiP enters/leaves so the toolbar button can
   *  show/hide + reflect the active state. */
  (e: "pip", state: { supported: boolean; active: boolean }): void;
}>();

const player = ref<InstanceType<typeof VideoPlayer> | null>(null);

/**
 * The actual <video> element is deep inside VideoPlayer (which is the
 * video.js mount target). We find it by query rather than passing a ref
 * through — video.js's lifecycle replaces / wraps the element a few
 * times during init, and a passed ref would dangle. Polling for the
 * element once on mount is reliable and cheap.
 */
const findVideoEl = (): HTMLVideoElement | null => {
  const root = (player.value?.$el ?? null) as HTMLElement | null;
  if (!root) return null;
  if (root.tagName === "VIDEO") return root as HTMLVideoElement;
  return root.querySelector<HTMLVideoElement>("video");
};

const onLoadedMetadata = (event: Event) => {
  const el = event.currentTarget as HTMLVideoElement;
  preparing.value = false; // the (possibly transcoded) stream is playing
  emit("metadata", {
    width: el.videoWidth,
    height: el.videoHeight,
    duration: el.duration,
    textTracks: el.textTracks?.length ?? 0,
  });
};

// Native playback error → escalate: first failure swaps to the transcoded
// stream (if available); a second failure (transcode also unplayable, or no
// transcode) shows the download card.
const onVideoError = () => {
  // Native source failed and we haven't escalated yet → swap to transcode.
  // (If we're already on the transcode — via escalation OR preferTranscode —
  // a failure here means even the transcode is unplayable → download card.)
  if (!usingTranscode.value && transcodeEnabled && props.transcodeSource) {
    failed.value = false;
    preparing.value = true;
    useTranscode.value = true; // → effectiveSource changes → player remounts
  } else {
    preparing.value = false;
    failed.value = true;
  }
};

// ── Picture-in-Picture (v1.3 S5-8) ─────────────────────────────────
/** Report PiP support + current active state to the parent toolbar. */
const emitPipState = () => {
  const supported =
    !!document.pictureInPictureEnabled && !video?.disablePictureInPicture;
  emit("pip", {
    supported,
    active: !!video && document.pictureInPictureElement === video,
  });
};

/** Toggle PiP for the current <video>. Exposed for the toolbar button.
 *  Wrapped in try/catch: requestPictureInPicture rejects if the frame
 *  isn't ready or the gesture isn't trusted — a no-op is the right
 *  fallback (the button just does nothing rather than throwing). */
const togglePip = async () => {
  if (!video) return;
  try {
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  } catch {
    /* not ready / not permitted — ignore */
  }
};

defineExpose({ player, togglePip });

let video: HTMLVideoElement | null = null;
const detach = () => {
  video?.removeEventListener("loadedmetadata", onLoadedMetadata);
  video?.removeEventListener("error", onVideoError);
  video?.removeEventListener("enterpictureinpicture", emitPipState);
  video?.removeEventListener("leavepictureinpicture", emitPipState);
};
const attach = () => {
  detach();
  video = findVideoEl();
  if (!video) {
    // No element yet — report PiP unsupported so the button hides.
    emit("pip", { supported: false, active: false });
    return;
  }
  video.addEventListener("loadedmetadata", onLoadedMetadata);
  video.addEventListener("error", onVideoError);
  video.addEventListener("enterpictureinpicture", emitPipState);
  video.addEventListener("leavepictureinpicture", emitPipState);
  emitPipState();
  // Already errored before we attached (fast failure) — escalate now.
  if (video.error) {
    onVideoError();
    return;
  }
  // Already loaded (e.g. cached) — fire immediately.
  if (video.readyState >= 1) {
    onLoadedMetadata({ currentTarget: video } as unknown as Event);
  }
};

onMounted(() => {
  // Unplayable container → we load the transcode immediately; show the
  // preparing overlay until its metadata arrives (remux is near-instant,
  // a full transcode of a long file takes longer).
  if (usingTranscode.value) preparing.value = true;
  // video.js takes a tick to mount; defer one frame.
  requestAnimationFrame(attach);
});

// Re-attach whenever the player remounts: a new file (props.source) or a
// swap to the transcoded stream (effectiveSource).
watch(effectiveSource, () => requestAnimationFrame(attach));

onBeforeUnmount(() => {
  detach();
  video = null;
  stopPrepTimer();
});
</script>

<style scoped>
/**
 * VideoViewer wraps the existing video.js-backed VideoPlayer in a card
 * matching the mockup chrome (rounded frame, soft shadow). The internal
 * controls are themed via the global video.js overrides in
 * `css/videojs.css` (loaded once at app bootstrap) so they stop looking
 * like default video.js and start matching our design tokens.
 *
 * The card uses cinema-black inside intentionally — video looks wrong
 * on a white canvas, and the surrounding stage already keeps us in-
 * system via the dotted paper backdrop.
 */
.video-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-viewer__frame {
  position: relative;
  background: #0a0a0a;
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.36);
  width: min(100%, 1280px);
  max-height: 100%;
  aspect-ratio: 16 / 9;
}

/* The actual <video> element fills the frame. Object-fit contain keeps
   the aspect ratio without cropping; black bezels do the rest. */
.video-viewer__frame :deep(.video-js),
.video-viewer__frame :deep(.video-max) {
  position: absolute !important;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}

.video-viewer__frame :deep(.video-js video),
.video-viewer__frame :deep(.vjs-tech) {
  object-fit: contain;
}

/* ── "Preparing…" overlay (during transcode) ─────────────────────────── */
.video-viewer__preparing {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  background: rgba(10, 10, 10, 0.78);
  color: #fff;
  font-size: 13px;
  z-index: 2;
}
.video-viewer__preparing-title {
  font-size: 14px;
  font-weight: 600;
}
.video-viewer__preparing-sub {
  max-width: 340px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.66);
}
.video-viewer__preparing-timer {
  margin-top: 2px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.5);
}
.video-viewer__spin {
  animation: video-viewer-spin 0.9s linear infinite;
}
@keyframes video-viewer-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Can't-play fallback card ────────────────────────────────────────── */
.video-viewer__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  text-align: center;
  width: min(100%, 420px);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18);
  color: var(--color-ink-3, #a1a1aa);
}
.video-viewer__fallback-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}
.video-viewer__fallback-hint {
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  max-width: 32ch;
  line-height: 1.45;
}
.video-viewer__fallback-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.video-viewer__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  border: 1px solid transparent;
  cursor: pointer;
}
.video-viewer__btn--primary {
  background: var(--accent-gradient);
  color: #fff;
}
.video-viewer__btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}
.video-viewer__btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
</style>
