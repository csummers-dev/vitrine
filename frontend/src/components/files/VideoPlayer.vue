<template>
  <video ref="videoPlayer" class="video-max video-js" controls preload="auto">
    <source />
    <track
      kind="subtitles"
      v-for="(sub, index) in subtitles"
      :key="index"
      :src="sub"
      :label="subLabel(sub)"
      :default="defaultSubtitle ? sub === defaultSubtitle : index === 0"
    />
    <p class="vjs-no-js">
      Sorry, your browser doesn't support embedded videos, but don't worry, you
      can <a :href="source">download it</a>
      and watch it with your favorite video player!
    </p>
  </video>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "videojs-mobile-ui";
import "videojs-hotkeys";
import "video.js/dist/video-js.min.css";
import "videojs-mobile-ui/dist/videojs-mobile-ui.css";

const videoPlayer = ref<HTMLElement | null>(null);
const player = ref<Player | null>(null);

const props = withDefaults(
  defineProps<{
    source: string;
    subtitles?: string[];
    options?: any;
    /** S5-7: URL of the track to show by default (e.g. a just-uploaded
     *  subtitle). When set, this track gets `default` instead of the
     *  first one, so video.js shows it on init. */
    defaultSubtitle?: string;
  }>(),
  {
    options: {},
  }
);

const source = ref(props.source);
const sourceType = ref("");

nextTick(() => {
  initVideoPlayer();
});

onMounted(() => {});

onBeforeUnmount(() => {
  if (player.value) {
    player.value.dispose();
    player.value = null;
  }
});

const initVideoPlayer = () => {
  try {
    // English is the only supported language; video.js ships English built-in,
    // so no language pack needs to be loaded or registered.
    sourceType.value = getSourceType(source.value);

    const srcOpt = { sources: { src: props.source, type: sourceType.value } };
    // support for playback at different speeds.
    const playbackRatesOpt = { playbackRates: [0.5, 1, 1.5, 2, 2.5, 3] };
    const options = getOptions(props.options, srcOpt, playbackRatesOpt);
    player.value = videojs(videoPlayer.value!, options, () => {});

    // TODO: need to test on mobile
    // @ts-expect-error no ts definition for mobileUi
    player.value!.mobileUi();
  } catch (error) {
    console.error("Error initializing video player:", error);
  }
};

const getOptions = (...srcOpt: any[]) => {
  const options = {
    controlBar: {
      skipButtons: {
        forward: 5,
        backward: 5,
      },
    },
    html5: {
      nativeTextTracks: false,
    },
    plugins: {
      hotkeys: {
        volumeStep: 0.1,
        seekStep: 10,
        enableModifiersForNumbers: false,
        // Free ←/→ for app-level neighbor-file navigation (Preview.vue):
        // returning false from these detectors disables video.js's
        // arrow-key seeking. Space (play/pause), M (mute), F (fullscreen),
        // and ↑/↓ (volume) all keep working.
        rewindKey: () => false,
        forwardKey: () => false,
      },
    },
  };

  return videojs.obj.merge(options, ...srcOpt);
};

const getSourceType = (source: string) => {
  if (!source) return "";
  // The on-demand transcode endpoint always streams H.264/AAC MP4 — but its
  // URL keeps the ORIGINAL file path (e.g. …/api/transcode/movie.avi), so
  // without an explicit type video.js would infer an unplayable MIME
  // (video/x-msvideo, …) from the .avi/.wmv/… suffix and refuse the (really
  // MP4) stream. Force MP4 for any transcode source. (#3)
  if (source.includes("api/transcode")) {
    return "video/mp4";
  }
  // Native .mkv: tell video.js it's MP4 so it'll attempt H.264-in-Matroska.
  const fileExtension = source.split("?")[0].split(".").pop();
  if (fileExtension?.toLowerCase() === "mkv") {
    return "video/mp4";
  }
  return "";
};

const subLabel = (subUrl: string) => {
  let url: URL;
  try {
    url = new URL(subUrl);
  } catch {
    // treat it as a relative url
    // we only need this for filename
    url = new URL(subUrl, window.location.origin);
  }

  const label = decodeURIComponent(
    url.pathname
      .split("/")
      .pop()!
      .replace(/\.[^/.]+$/, "")
  );

  return label;
};
</script>
<style scoped>
.video-max {
  width: 100%;
  height: 100%;
}
</style>
