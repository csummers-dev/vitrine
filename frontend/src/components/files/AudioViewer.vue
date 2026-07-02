<template>
  <div class="audio-viewer">
    <div class="audio-viewer__card">
      <!-- Album art: prefers the ID3v2 APIC frame extracted client-side
           by music-metadata (E2). Falls back to the gradient when the
           file has no embedded artwork. -->
      <div
        class="audio-viewer__art"
        :class="{ 'audio-viewer__art--fallback': !artworkUrl }"
        :style="artworkUrl ? { backgroundImage: `url('${artworkUrl}')` } : {}"
        :aria-label="artworkUrl ? 'Album artwork' : undefined"
        role="img"
      ></div>

      <!-- Everything except the art lives in __body so a wide preview area
           can lay art + body out side-by-side (see the container query). -->
      <div class="audio-viewer__body">
        <!-- Track info — prefers parsed ID3 over props, props over filename. -->
        <div class="audio-viewer__track">
          <div class="audio-viewer__eyebrow">Track</div>
          <h1 class="audio-viewer__title">{{ displayedTitle }}</h1>
          <div v-if="displayedSubtitle" class="audio-viewer__subtitle">
            {{ displayedSubtitle }}
          </div>
        </div>

        <!-- Plain scrubber (per design feedback — no waveform).
           Click anywhere on the track to seek. -->
        <div class="audio-viewer__scrubber-wrap">
          <button
            ref="scrubberEl"
            type="button"
            class="audio-viewer__scrubber"
            :aria-label="`Seek · ${formatTime(currentTime)} of ${formatTime(duration)}`"
            @click="onScrub"
            @keydown="onScrubKey"
          >
            <div
              class="audio-viewer__scrubber-progress"
              :style="{ width: `${progressPct}%` }"
            >
              <span class="audio-viewer__scrubber-thumb"></span>
            </div>
          </button>
          <div class="audio-viewer__time">
            <span class="tabular">{{ formatTime(currentTime) }}</span>
            <span class="tabular">{{ formatTime(duration) }}</span>
          </div>
        </div>

        <!-- Transport controls. The play/pause icon sits inside a 48px
           circular button. Lucide's `play` glyph is visually
           asymmetric (triangle points right) so we nudge it 1px right
           in the play state; `pause` is symmetric and centers
           naturally. -->
        <div class="audio-viewer__controls">
          <button
            type="button"
            class="audio-viewer__btn"
            :disabled="!hasPrevious"
            title="Previous track"
            aria-label="Previous track"
            @click="$emit('prev')"
          >
            <Icon name="skip-back" :size="16" :stroke-width="2" />
          </button>
          <button
            type="button"
            class="audio-viewer__btn"
            title="Back 10s"
            aria-label="Back 10s"
            @click="seek(-10)"
          >
            <Icon name="rotate-ccw" :size="16" />
          </button>
          <button
            type="button"
            class="audio-viewer__btn audio-viewer__btn--play"
            :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            @click="togglePlay"
          >
            <!-- Distinct icon nodes so the play-triangle nudge doesn't
               leak to the pause state. -->
            <Icon
              v-if="isPlaying"
              name="pause"
              :size="20"
              :stroke-width="2"
              class="audio-viewer__play-icon"
            />
            <Icon
              v-else
              name="play"
              :size="20"
              :stroke-width="2"
              class="audio-viewer__play-icon audio-viewer__play-icon--nudge"
            />
          </button>
          <button
            type="button"
            class="audio-viewer__btn"
            title="Forward 10s"
            aria-label="Forward 10s"
            @click="seek(10)"
          >
            <Icon name="rotate-cw" :size="16" />
          </button>
          <button
            type="button"
            class="audio-viewer__btn"
            :disabled="!hasNext"
            title="Next track"
            aria-label="Next track"
            @click="$emit('next')"
          >
            <Icon name="skip-forward" :size="16" :stroke-width="2" />
          </button>
        </div>

        <!-- Volume strip (footer of the card) -->
        <div class="audio-viewer__volume">
          <button
            type="button"
            class="audio-viewer__volume-btn"
            :title="muted ? 'Unmute' : 'Mute'"
            :aria-label="muted ? 'Unmute' : 'Mute'"
            @click="toggleMute"
          >
            <Icon
              :name="
                muted || volume === 0
                  ? 'volume-x'
                  : volume < 0.5
                    ? 'volume-1'
                    : 'volume-2'
              "
              :size="14"
            />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="volumePct"
            :style="{ '--volume-fill': `${volumePct}%` }"
            aria-label="Volume"
            class="audio-viewer__volume-bar"
            @input="onVolumeInput"
          />
          <span class="audio-viewer__volume-pct tabular">
            {{ volumePct }}%
          </span>
        </div>
      </div>

      <!-- Hidden HTML5 audio element that owns playback. Everything
           visual above drives this element via refs / events. -->
      <audio
        ref="audioEl"
        :src="src"
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @volumechange="onVolumeChange"
        @ended="onEnded"
      ></audio>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import { parseBlob, type IAudioMetadata } from "music-metadata";

/** Parsed audio metadata surfaced to the parent (Preview.vue) so it
 *  can populate the toolbar title + the info-rail Track section. */
export interface AudioMeta {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  artworkUrl?: string;
}

const props = withDefaults(
  defineProps<{
    src: string;
    name: string;
    /** Optional ID3-extracted track title; falls back to filename. */
    title?: string;
    /** Optional artist line (rendered under the title if present). */
    artist?: string;
    /** Optional album line (joined with artist if both present). */
    album?: string;
    /** Whether to enable prev / next track navigation buttons. */
    hasPrevious?: boolean;
    hasNext?: boolean;
    /** 2.1 #2: server-side cover thumbnail URL. Used as a fallback when the
     *  client-side music-metadata parse yields no artwork — notably .opus,
     *  whose METADATA_BLOCK_PICTURE base64 makes music-metadata's atob() throw
     *  and abort the whole parse. The backend (which wrote the cover) extracts
     *  it reliably. */
    coverFallbackUrl?: string;
  }>(),
  {
    title: "",
    artist: "",
    album: "",
    hasPrevious: false,
    hasNext: false,
    coverFallbackUrl: "",
  }
);

const emit = defineEmits<{
  (e: "prev"): void;
  (e: "next"): void;
  (e: "ended"): void;
  (e: "metadata", meta: AudioMeta): void;
}>();

// Parsed metadata + extracted artwork URL. artworkUrl is a blob URL
// kept around for the lifetime of the current src; revoked on src
// change or unmount so we don't leak browser memory across navigation.
const parsedMeta = ref<AudioMeta | null>(null);
const artworkUrl = ref<string>("");
let artworkRevocable: string | null = null;

const audioEl = ref<HTMLAudioElement | null>(null);
const scrubberEl = ref<HTMLButtonElement | null>(null);

const isPlaying = ref<boolean>(false);
const currentTime = ref<number>(0);
const duration = ref<number>(0);
const volume = ref<number>(1);
const muted = ref<boolean>(false);

const progressPct = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
});

// Volume as a 0–100 integer; muted reads as 0. Drives both the displayed %
// and the lilac fill of the volume slider (see --volume-fill in the CSS).
const volumePct = computed(() =>
  muted.value ? 0 : Math.round(volume.value * 100)
);

// Displayed values: parsed ID3 wins, then prop, then filename. Lets the
// parent (Preview.vue) keep passing the filename as a fallback while
// the actual track title surfaces once parsing completes.
const displayedTitle = computed(
  () => parsedMeta.value?.title || props.title || props.name
);
const displayedSubtitle = computed(() => {
  const artist = parsedMeta.value?.artist || props.artist;
  const album = parsedMeta.value?.album || props.album;
  const year = parsedMeta.value?.year;
  const parts: string[] = [];
  if (artist) parts.push(artist);
  if (album) {
    parts.push(year ? `${album} · ${year}` : album);
  } else if (year) {
    parts.push(String(year));
  }
  return parts.join(" · ");
});

// ── Playback controls ────────────────────────────────────────────
const togglePlay = () => {
  if (!audioEl.value) return;
  if (audioEl.value.paused) {
    audioEl.value.play().catch(() => {
      /* autoplay blocked — user just has to click again */
    });
  } else {
    audioEl.value.pause();
  }
};

const seek = (deltaSec: number) => {
  if (!audioEl.value) return;
  const next = Math.max(
    0,
    Math.min(audioEl.value.duration || 0, audioEl.value.currentTime + deltaSec)
  );
  audioEl.value.currentTime = next;
};

const toggleMute = () => {
  if (!audioEl.value) return;
  audioEl.value.muted = !audioEl.value.muted;
};

const onVolumeInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const v = parseInt(target.value, 10) / 100;
  if (!audioEl.value) return;
  audioEl.value.volume = v;
  if (v > 0) audioEl.value.muted = false;
};

// ── Scrubber interactions ────────────────────────────────────────
const onScrub = (event: MouseEvent) => {
  if (!audioEl.value || !scrubberEl.value || !duration.value) return;
  const rect = scrubberEl.value.getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left) / rect.width)
  );
  audioEl.value.currentTime = ratio * duration.value;
};

const onScrubKey = (event: KeyboardEvent) => {
  // Make the scrubber arrow-key reachable. ←/→ = 5s, ↑/↓ = 10s.
  if (!audioEl.value) return;
  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      seek(-5);
      break;
    case "ArrowRight":
      event.preventDefault();
      seek(5);
      break;
    case "ArrowDown":
      event.preventDefault();
      seek(-10);
      break;
    case "ArrowUp":
      event.preventDefault();
      seek(10);
      break;
    case "Home":
      event.preventDefault();
      audioEl.value.currentTime = 0;
      break;
    case "End":
      event.preventDefault();
      audioEl.value.currentTime = audioEl.value.duration || 0;
      break;
  }
};

// ── Media-element event handlers ─────────────────────────────────
const onLoadedMetadata = () => {
  if (!audioEl.value) return;
  duration.value = audioEl.value.duration || 0;
};

const onTimeUpdate = () => {
  if (!audioEl.value) return;
  currentTime.value = audioEl.value.currentTime;
};

const onVolumeChange = () => {
  if (!audioEl.value) return;
  volume.value = audioEl.value.volume;
  muted.value = audioEl.value.muted;
};

const onEnded = () => {
  isPlaying.value = false;
  emit("ended");
};

// ── Format helpers ────────────────────────────────────────────────
/** Format a duration in seconds as H:MM:SS or M:SS depending on length. */
const formatTime = (secs: number): string => {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// NOTE on declaration order: `revokeArtwork` and `extractMetadata` MUST
// be declared BEFORE the `watch(..., { immediate: true })` below.
// Immediate watchers fire their callback synchronously inside the
// `watch()` call — which happens during component setup — and JS
// `const` is in the temporal dead zone until its declaration line.
// Putting the watch first and the consts after threw a ReferenceError
// on the very first src observation, which Vue surfaced as paired
// "execution of watcher callback" + "execution of setup function"
// errors and left AudioViewer in a broken state.

const revokeArtwork = () => {
  if (artworkRevocable) {
    URL.revokeObjectURL(artworkRevocable);
    artworkRevocable = null;
  }
};

/**
 * Range-fetch the first ~512 KB of the audio file and parse it with
 * music-metadata to surface title / artist / album / album-art etc.
 *
 * Critical behavior: this MUST NOT interfere with the `<audio>` element
 * (which fetches the same URL independently for playback). We use a
 * tightly-scoped Range request — never the whole file — for three
 * reasons:
 *
 *   1. ID3v2 tags + APIC artwork live in the file *header* (first few
 *      hundred KB at most); fetching the whole file just to read tags
 *      wastes bandwidth + memory for typical 5-50 MB tracks.
 *   2. The browser may serialize same-URL requests; a 50 MB metadata
 *      fetch could starve / cancel the audio element's own fetch and
 *      leave the player stuck on "loading".
 *   3. If the server doesn't honor Range, we silently fall back to
 *      skipping metadata rather than downloading the entire payload.
 *
 * On any failure (network, parse, server rejects Range, etc.) we
 * gracefully no-op — the audio element still plays, and the UI shows
 * the filename + fallback gradient artwork.
 */
// V3-E #17: 512 KB held an MP3's ID3v2 APIC (which lives in the header), but an
// OGG embeds its cover as base64 in a Vorbis comment (METADATA_BLOCK_PICTURE) —
// ~33% larger — so a ~1 MB cover was sliced in half ("only top half visible").
// 2 MB captures the whole comment for typical covers while staying bounded
// (never the whole multi-MB file) so it can't starve the audio element's fetch.
const METADATA_RANGE_BYTES = 2 * 1024 * 1024; // 2 MB

const extractMetadata = async (src: string) => {
  if (!src) return;
  try {
    const res = await fetch(src, {
      credentials: "include",
      headers: { Range: `bytes=0-${METADATA_RANGE_BYTES - 1}` },
    });
    // 206 = partial content (we got our Range). 200 = server ignored
    // Range and would give the whole file — skip rather than slurp it.
    if (res.status !== 206) return;

    const blob = await res.blob();
    if (blob.size === 0) return;

    const parsed: IAudioMetadata = await parseBlob(blob);
    const picture = parsed.common.picture?.[0];
    let url = "";
    if (picture) {
      const artBlob = new Blob([new Uint8Array(picture.data)], {
        type: picture.format,
      });
      url = URL.createObjectURL(artBlob);
      artworkRevocable = url;
    }
    artworkUrl.value = url;

    const meta: AudioMeta = {
      title: parsed.common.title || undefined,
      artist: parsed.common.artist || undefined,
      album: parsed.common.album || undefined,
      year: parsed.common.year || undefined,
      genre: parsed.common.genre?.[0] || undefined,
      bitrate: parsed.format.bitrate || undefined,
      sampleRate: parsed.format.sampleRate || undefined,
      channels: parsed.format.numberOfChannels || undefined,
      codec: parsed.format.codec || undefined,
      artworkUrl: url || undefined,
    };
    parsedMeta.value = meta;
    emit("metadata", meta);
  } catch {
    /* swallow — playback is unaffected, just no ID3 surface */
  } finally {
    // 2.1 #2: if the client-side parse produced no artwork (no embedded cover,
    // or — for .opus — music-metadata threw on the base64 picture), fall back
    // to the server-extracted cover, which is reliable across all formats.
    applyCoverFallback();
  }
};

// Probe the backend cover thumbnail and adopt it only if it actually loads, so
// a format/file the server can't cover for stays on the gradient rather than a
// broken image. No-op once we already have artwork.
const applyCoverFallback = () => {
  if (artworkUrl.value || !props.coverFallbackUrl) return;
  const candidate = props.coverFallbackUrl;
  const probe = new Image();
  probe.onload = () => {
    if (!artworkUrl.value) artworkUrl.value = candidate;
  };
  probe.src = candidate;
};

// ── Reset on src change so a swap between tracks doesn't show the
// previous time / playing state for a frame. Also kicks off ID3
// extraction for the new file. Declared AFTER the helpers above —
// `{ immediate: true }` runs the callback during setup, so those
// functions must already exist in scope by the time it fires.
watch(
  () => props.src,
  (next) => {
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;
    parsedMeta.value = null;
    revokeArtwork();
    artworkUrl.value = "";
    if (next) void extractMetadata(next);
  },
  { immediate: true }
);

// ── Keyboard handler — installed while AudioViewer is mounted ─────
// Three shortcuts:
//   • Space → toggle play/pause
//   • j     → previous track  (vi-style, G4)
//   • k     → next track      (vi-style, G4)
// All skip when focus is in a text input / textarea / contenteditable
// so typing "j" or "k" in the search bar or any other field is safe.
// `j`/`k` are intentionally additive to the existing arrow-key nav in
// Preview.vue — arrows still work, this just gives an alternative for
// users who prefer a vi-style left-hand-home-row workflow.
const onKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target instanceof HTMLInputElement) return;
  if (target instanceof HTMLTextAreaElement) return;
  if (target?.isContentEditable) return;

  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    togglePlay();
    return;
  }
  if (event.key === "j") {
    if (!props.hasPrevious) return;
    event.preventDefault();
    emit("prev");
    return;
  }
  if (event.key === "k") {
    if (!props.hasNext) return;
    event.preventDefault();
    emit("next");
    return;
  }
};

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  revokeArtwork();
});
</script>

<style scoped>
.audio-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Query container so the card can go landscape based on the ACTUAL
     available width (shrinks when the info pane is open), not the viewport. */
  container-type: inline-size;
  padding: 16px;
}

.audio-viewer__card {
  width: min(440px, 100%);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Wrapper for everything beside the art — keeps the vertical stacking of
   track/scrubber/controls/volume identical in the narrow layout. */
.audio-viewer__body {
  display: flex;
  flex-direction: column;
}

/* Landscape: when the preview area is wide enough, place the art beside a
   wider body so the player fills the space instead of a fixed 360px column. */
@container (min-width: 560px) {
  .audio-viewer__card {
    flex-direction: row;
    /* Fill the available stage width (up to a generous cap) instead of a
       fixed narrow column — the player should feel like it owns the space. */
    width: 100%;
    max-width: 960px;
    align-items: stretch;
  }
  .audio-viewer__art {
    /* Art scales with the card but never dominates; the body keeps the rest.
       Album art is always square, so keep the 1:1 box (the previous
       aspect-ratio:auto + align-items:stretch stretched it into a tall
       rectangle). align-self:center stops the row's stretch from overriding
       the square; the body, being taller, owns the remaining height. */
    width: clamp(220px, 34cqw, 360px);
    height: auto;
    aspect-ratio: 1 / 1;
    align-self: center;
    flex-shrink: 0;
  }
  .audio-viewer__body {
    flex: 1;
    min-width: 0;
    justify-content: center;
    /* A touch more breathing room for the controls in the wide layout. */
    padding: 8px 4px;
  }
}

/* ── Album art ────────────────────────────────────────────────── */
.audio-viewer__art {
  aspect-ratio: 1 / 1;
  /* V3-E #14: show the FULL artwork. `cover` cropped it to fill the box (and in
     the wide layout the box is no longer square), so only the centre was
     visible. `contain` fits the whole image, letterboxing against the chip
     colour for non-square art. */
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  background-color: var(--color-elevated, #f4f4f5);
  /* 2.1 #5: 10px squircle so the square art doesn't read as a flat slab. */
  border-radius: 10px;
}

/* Fallback gradient when no embedded artwork was found in the file. */
.audio-viewer__art--fallback {
  /* Calm Minimal: accent-tinted fallback cover (was amber→magenta), follows the
     accent picker. */
  background:
    radial-gradient(
      at 25% 25%,
      rgb(var(--accent-rgb) / 0.5) 0%,
      transparent 55%
    ),
    radial-gradient(
      at 80% 75%,
      rgb(var(--accent-rgb) / 0.28) 0%,
      transparent 55%
    ),
    var(--accent-gradient);
}

html.dark .audio-viewer__art--fallback {
  background:
    radial-gradient(
      at 25% 25%,
      rgb(var(--accent-rgb) / 0.42) 0%,
      transparent 55%
    ),
    radial-gradient(
      at 80% 75%,
      rgb(var(--accent-rgb) / 0.24) 0%,
      transparent 55%
    ),
    var(--accent-gradient);
}

/* ── Track info ───────────────────────────────────────────────── */
.audio-viewer__track {
  padding: 18px 20px 12px;
}
.audio-viewer__eyebrow {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-bottom: 4px;
}
.audio-viewer__title {
  margin: 0 0 2px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-ink-1, #18181b);
  line-height: 1.25;
  word-break: break-word;
}
.audio-viewer__subtitle {
  font-size: 12px;
  color: var(--color-ink-2, #52525b);
  line-height: 1.35;
}

/* ── Plain scrubber ────────────────────────────────────────────── */
.audio-viewer__scrubber-wrap {
  padding: 8px 20px 6px;
}
.audio-viewer__scrubber {
  display: block;
  width: 100%;
  height: 14px;
  position: relative;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.audio-viewer__scrubber::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  border-radius: 999px;
  background: var(--color-elevated, #f4f4f5);
}
.audio-viewer__scrubber:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 4px;
  border-radius: 4px;
}
.audio-viewer__scrubber-progress {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  border-radius: 999px;
  background: var(--accent-gradient);
  pointer-events: none;
}
.audio-viewer__scrubber-thumb {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  box-shadow: 0 0 0 4px var(--color-accent-soft, rgba(110, 114, 217, 0.1));
}

.audio-viewer__time {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}

/* ── Transport controls ──────────────────────────────────────── */
.audio-viewer__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 20px 18px;
}

.audio-viewer__btn {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease,
    opacity var(--dur-base) ease;
}
.audio-viewer__btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.audio-viewer__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}
.audio-viewer__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* The play/pause button. Critical: the inner icon must be perfectly
   centered. Lucide's `play` glyph is a right-pointing triangle whose
   visual centroid is left of its bounding-box center, so we nudge it
   1px right when in the play state. `pause` is symmetric — no nudge. */
.audio-viewer__btn--play {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: var(--accent-gradient);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.audio-viewer__btn--play:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  color: white;
}

.audio-viewer__play-icon {
  fill: white;
  display: block;
}
.audio-viewer__play-icon--nudge {
  /* Visual-center the right-pointing triangle inside the round button. */
  transform: translateX(1px);
}

/* ── Volume ───────────────────────────────────────────────────── */
.audio-viewer__volume {
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.audio-viewer__volume-btn {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.audio-viewer__volume-btn:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}

/* Native range input theming — same lilac fill as the scrubber.
   Range inputs don't paint the value region on their own, so the filled
   portion is drawn here: WebKit/Blink get a hard-stop gradient driven by
   --volume-fill (set inline from volumePct); Firefox uses ::-moz-range-progress
   below. Beyond the thumb the track falls back to the neutral elevated color. */
.audio-viewer__volume-bar {
  flex: 1;
  appearance: none;
  -webkit-appearance: none;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--color-accent, #6e72d9) var(--volume-fill, 0%),
    var(--color-elevated, #f4f4f5) var(--volume-fill, 0%)
  );
  cursor: pointer;
  outline: none;
}
.audio-viewer__volume-bar::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: var(--color-elevated, #f4f4f5);
}
.audio-viewer__volume-bar::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--color-accent, #6e72d9);
}
.audio-viewer__volume-bar::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  border: 0;
  cursor: pointer;
}
.audio-viewer__volume-bar::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  border: 0;
  cursor: pointer;
}
.audio-viewer__volume-bar:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 2px;
}

.audio-viewer__volume-pct {
  width: 32px;
  text-align: right;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}

.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
