<template>
  <div class="video-viewer">
    <div class="video-viewer__frame">
      <VideoPlayer
        ref="player"
        :source="source"
        :subtitles="subtitles"
        :options="options"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import VideoPlayer from "@/components/files/VideoPlayer.vue";

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
}>();
void props;

const emit = defineEmits<{
  (e: "metadata", meta: VideoMeta): void;
}>();

const player = ref<InstanceType<typeof VideoPlayer> | null>(null);
defineExpose({ player });

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
  const video = event.currentTarget as HTMLVideoElement;
  emit("metadata", {
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
    textTracks: video.textTracks?.length ?? 0,
  });
};

let video: HTMLVideoElement | null = null;
const attach = () => {
  video?.removeEventListener("loadedmetadata", onLoadedMetadata);
  video = findVideoEl();
  if (!video) return;
  video.addEventListener("loadedmetadata", onLoadedMetadata);
  // Already loaded (e.g. cached) — fire immediately.
  if (video.readyState >= 1) {
    onLoadedMetadata({ currentTarget: video } as unknown as Event);
  }
};

onMounted(() => {
  // video.js takes a tick to mount; defer one frame.
  requestAnimationFrame(attach);
});

// If source swaps (user navigates to a new video), re-attach.
watch(
  () => props.source,
  () => requestAnimationFrame(attach)
);

onBeforeUnmount(() => {
  video?.removeEventListener("loadedmetadata", onLoadedMetadata);
  video = null;
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
</style>
