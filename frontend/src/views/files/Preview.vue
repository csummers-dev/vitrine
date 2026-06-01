<template>
  <PreviewShell
    :name="name"
    :icon-name="iconName"
    :icon-color-class="iconColorClass"
    :type-label="typeLabel"
    :position-label="positionLabel"
    :has-previous="hasPrevious"
    :has-next="hasNext"
    :info-open="infoOpen"
    :can-download="!!authStore.user?.perm.download"
    :can-share="!!authStore.user?.perm.share && !!authStore.user?.perm.download"
    @close="close"
    @prev="prev"
    @next="next"
    @download="download"
    @share="share"
    @toggle-info="infoOpen = !infoOpen"
    @user-activity="toggleNavigation"
  >
    <!-- ── Toolbar: format-specific controls ──────────────────────── -->
    <template #toolbar-format>
      <!-- Text: soft-wrap toggle + edit-as-text -->
      <template
        v-if="
          fileStore.req?.type === 'text' ||
          fileStore.req?.type === 'textImmutable'
        "
      >
        <!-- Markdown: Rendered / Raw toggle (S5-2). Only for .md files. -->
        <button
          v-if="isMarkdownFile"
          type="button"
          class="preview-fit__btn"
          :class="{ 'is-active': textRenderMarkdown }"
          :title="textRenderMarkdown ? 'Show raw source' : 'Show rendered'"
          :aria-label="textRenderMarkdown ? 'Show raw source' : 'Show rendered'"
          :aria-pressed="textRenderMarkdown"
          @click="textRenderMarkdown = !textRenderMarkdown"
        >
          <Icon :name="textRenderMarkdown ? 'code' : 'book-open'" :size="14" />
        </button>
        <!-- Soft-wrap toggle — irrelevant in rendered markdown (which
             wraps naturally), so hide it there. -->
        <button
          v-if="!(isMarkdownFile && textRenderMarkdown)"
          type="button"
          class="preview-fit__btn"
          :class="{ 'is-active': textSoftWrap }"
          :title="textSoftWrap ? 'No wrap' : 'Soft wrap'"
          :aria-label="textSoftWrap ? 'No wrap' : 'Soft wrap'"
          :aria-pressed="textSoftWrap"
          @click="textSoftWrap = !textSoftWrap"
        >
          <Icon :name="textSoftWrap ? 'wrap-text' : 'pilcrow'" :size="14" />
        </button>
        <button
          v-if="fileStore.req?.type === 'text'"
          type="button"
          class="preview-toolbar-format__btn"
          title="Edit as text"
          aria-label="Edit as text"
          @click="editAsText"
        >
          <Icon name="file-pen-line" :size="14" />
          <span class="max-md:hidden">Edit</span>
        </button>
      </template>

      <!-- PDF: page counter input + zoom controls -->
      <template v-if="isPdf">
        <div class="preview-page">
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            :value="pdfPage"
            class="preview-page__input tabular"
            :aria-label="`Current page (of ${pdfTotalPages})`"
            @change="onPdfPageInput"
            @keydown.enter.prevent="onPdfPageInput($event)"
          />
          <span class="preview-page__sep tabular">/ {{ pdfTotalPages }}</span>
        </div>
        <div class="preview-zoom">
          <button
            type="button"
            class="preview-zoom__btn"
            :disabled="zoomPercent <= 25"
            title="Zoom out"
            aria-label="Zoom out"
            @click="zoomOut"
          >
            <Icon name="zoom-out" :size="14" />
          </button>
          <span class="preview-zoom__value tabular">{{ zoomPercent }}%</span>
          <button
            type="button"
            class="preview-zoom__btn"
            :disabled="zoomPercent >= 400"
            title="Zoom in"
            aria-label="Zoom in"
            @click="zoomIn"
          >
            <Icon name="zoom-in" :size="14" />
          </button>
        </div>
      </template>

      <!-- Image: zoom + fit toggle -->
      <template v-if="fileStore.req?.type === 'image'">
        <div class="preview-zoom">
          <button
            type="button"
            class="preview-zoom__btn"
            :disabled="fitToScreen || zoomPercent <= 25"
            title="Zoom out"
            aria-label="Zoom out"
            @click="zoomOut"
          >
            <Icon name="zoom-out" :size="14" />
          </button>
          <span class="preview-zoom__value tabular">
            {{ fitToScreen ? "Fit" : `${zoomPercent}%` }}
          </span>
          <button
            type="button"
            class="preview-zoom__btn"
            :disabled="fitToScreen || zoomPercent >= 400"
            title="Zoom in"
            aria-label="Zoom in"
            @click="zoomIn"
          >
            <Icon name="zoom-in" :size="14" />
          </button>
        </div>
        <button
          type="button"
          class="preview-fit__btn"
          :class="{ 'is-active': fitToScreen }"
          :title="fitToScreen ? 'Actual size' : 'Fit to screen'"
          :aria-label="fitToScreen ? 'Actual size' : 'Fit to screen'"
          :aria-pressed="fitToScreen"
          @click="toggleFit"
        >
          <Icon :name="fitToScreen ? 'maximize-2' : 'maximize'" :size="14" />
        </button>
        <!-- Edit (S5-4) — opens the canvas image editor. Needs create
             permission since saving writes a new file. -->
        <button
          v-if="!!authStore.user?.perm.create"
          type="button"
          class="preview-toolbar-format__btn"
          title="Edit image"
          aria-label="Edit image"
          @click="imageEditorOpen = true"
        >
          <Icon name="pencil-ruler" :size="14" />
          <span class="max-md:hidden">Edit</span>
        </button>
      </template>

      <!-- Video: Picture-in-Picture (S5-8). Shown only when the browser
           supports PiP for the current <video>. Active state highlights
           while the floating window is open. -->
      <template v-if="fileStore.req?.type === 'video' && videoPip.supported">
        <button
          type="button"
          class="preview-fit__btn"
          :class="{ 'is-active': videoPip.active }"
          :title="
            videoPip.active ? 'Exit picture-in-picture' : 'Picture-in-picture'
          "
          :aria-label="
            videoPip.active ? 'Exit picture-in-picture' : 'Picture-in-picture'
          "
          :aria-pressed="videoPip.active"
          @click="videoViewer?.togglePip()"
        >
          <Icon name="picture-in-picture-2" :size="14" />
        </button>
      </template>
    </template>

    <!-- ── Stage: format-specific viewer ──────────────────────────── -->
    <template #stage>
      <div ref="stageEl" class="preview-stage__inner">
        <!-- Loading state — replaces the legacy .preview-loading delayed
             chrome with a calm centered spinner that matches the rest of
             the design system (settings, editor, etc.). -->
        <div v-if="layoutStore.loading" class="preview-stage__loading">
          <Icon name="loader-circle" :size="22" class="preview-spin" />
        </div>

        <!-- ── Per-format viewers — temporarily kept as inline branches
             so the shell can ship green-to-green. P2–P6 replace each
             branch with its dedicated viewer component matching the
             approved mockups. -->
        <template v-else>
          <!-- EPUB (P6: EpubViewer; owns its own light/dark theme
               override + a MutationObserver on <html class> so the
               book repaints live when the user toggles the app theme.
               @navigate-prev/-next: vue-reader's iframe absorbs arrow
               keys, so the viewer pipes them back up so file-to-file
               nav still works while reading.) -->
          <EpubViewer
            v-if="isEpub"
            ref="epubViewer"
            :src="previewUrl"
            :location="location"
            :size="size"
            @update:location="locationChange"
            @update:size="changeSize"
            @navigate-prev="prev"
            @navigate-next="next"
            @toc="onEpubToc"
            @chapter="onEpubChapter"
          />

          <!-- CSV -->
          <CsvViewer
            v-else-if="isCsv"
            :content="csvContent"
            :error="csvError"
          />

          <!-- Image (P2: ImageViewer with zoom / fit / film strip) -->
          <ImageViewer
            v-else-if="fileStore.req?.type == 'image'"
            :src="previewUrl"
            :alt="name"
            :zoom-percent="zoomPercent"
            :fit-to-screen="fitToScreen"
            :strip="imageStrip"
            :current-url="currentItemUrl"
            @navigate="(u: string) => router.replace({ path: u })"
          />

          <!-- Audio (P4: AudioViewer = album card + plain scrubber +
               custom transport. Centered play-pause icon with the
               asymmetric-triangle nudge per design feedback. ID3 APIC
               artwork + tag parsing emit via @metadata — E2). -->
          <AudioViewer
            v-else-if="fileStore.req?.type == 'audio'"
            :src="previewUrl"
            :name="name"
            :has-previous="hasPrevious"
            :has-next="hasNext"
            @prev="prev"
            @next="next"
            @metadata="onAudioMetadata"
          />

          <!-- Video (P3: VideoViewer = framed card + themed video.js skin) -->
          <VideoViewer
            v-else-if="fileStore.req?.type == 'video'"
            :key="videoKey"
            ref="videoViewer"
            :source="previewUrl"
            :subtitles="subtitles"
            :options="videoOptions"
            :default-subtitle="defaultSubtitle"
            @metadata="onVideoMetadata"
            @pip="onVideoPip"
          />

          <!-- PDF (E4: PdfViewer = PDF.js-rendered pages with
               thumbnail rail; zoom + page-jump driven by the toolbar
               via two-way binding). -->
          <PdfViewer
            v-else-if="isPdf"
            :src="previewUrl"
            :name="name"
            :download-url="downloadUrl"
            :zoom-percent="zoomPercent"
            :page="pdfPage"
            @update:page="(n: number) => (pdfPage = n)"
            @update:total-pages="(n: number) => (pdfTotalPages = n)"
          />

          <!-- Text / textImmutable: read-only TextViewer in the new
               shell. Editor.vue stays the EDITING surface, reachable
               via the "Edit as text" action (writes ?edit=true into
               the route; see Files.vue). -->
          <TextViewer
            v-else-if="
              fileStore.req?.type === 'text' ||
              fileStore.req?.type === 'textImmutable'
            "
            :content="textContent"
            :soft-wrap="textSoftWrap"
            :is-markdown="isMarkdownFile"
            :rendered="textRenderMarkdown"
          />

          <!-- Blob (no-preview) — already on-brand from Stage 11d.
               Special case for .zip files (F4): the primary action is
               Extract (not Open / Download), so the most common
               next-action for an archive is one click away. -->
          <div v-else-if="fileStore.req?.type == 'blob'" class="preview-blob">
            <div
              class="preview-blob__icon"
              :class="isZip ? 'preview-blob__icon--zip' : ''"
            >
              <Icon
                :name="isZip ? 'package' : 'file-search'"
                :size="28"
                :stroke-width="1.4"
              />
            </div>
            <div class="preview-blob__title">
              {{ isZip ? "Zip archive" : $t("files.noPreview") }}
            </div>
            <div class="preview-blob__hint">
              {{
                isZip
                  ? "This is a compressed archive. Extract to view the contents."
                  : "This file type can't be previewed in the browser."
              }}
            </div>
            <!-- Zip: no inline actions — the Extract button lives in the
                 details sidebar next to Move/Copy. Non-zip blobs still
                 get Download/Open since there's no equivalent surface
                 for them. -->
            <div v-if="!isZip" class="preview-blob__actions">
              <a
                :href="downloadUrl"
                target="_blank"
                rel="noopener"
                class="preview-blob__btn preview-blob__btn--primary"
              >
                <Icon name="download" :size="14" />
                <span>{{ $t("buttons.download") }}</span>
              </a>
              <a
                v-if="!fileStore.req?.isDir"
                :href="previewUrl"
                target="_blank"
                rel="noopener"
                class="preview-blob__btn preview-blob__btn--ghost"
              >
                <Icon name="external-link" :size="14" />
                <span>{{ $t("buttons.openFile") }}</span>
              </a>
            </div>
          </div>
        </template>

        <!-- Prefetch hints for next / previous siblings so nav feels instant -->
        <link rel="prefetch" :href="previousRaw" />
        <link rel="prefetch" :href="nextRaw" />
      </div>
    </template>

    <!-- ── Info rail (right side) ─────────────────────────────────── -->
    <template #info>
      <PreviewInfoRail
        :name="name"
        :icon-name="iconName"
        :icon-color-class="iconColorClass"
        :type-label="typeLabel"
        :size-label="sizeLabel"
        :modified-label="modifiedLabel"
        :extension-label="extensionLabel"
        :path="pathLabel"
        :can-share="
          !!authStore.user?.perm.share && !!authStore.user?.perm.download
        "
        :can-download="!!authStore.user?.perm.download"
        :can-rename="!!authStore.user?.perm.rename"
        :can-delete="!!authStore.user?.perm.delete"
        :can-move="!!authStore.user?.perm.rename"
        :can-copy="!!authStore.user?.perm.create"
        :can-extract="canExtractZip"
        :can-open-direct="canOpenDirect"
        @share="share"
        @download="download"
        @rename="rename"
        @delete="deleteFile"
        @move="move"
        @copy="copy"
        @extract="openExtract"
        @open-direct="openDirect"
      >
        <!-- Format-specific section. Each format may emit metadata
             from its viewer; we surface whatever's available here. -->
        <template
          v-if="
            fileStore.req?.type === 'video' ||
            videoMeta ||
            audioMeta ||
            imageExif ||
            (isEpub && epubToc.length > 0)
          "
          #format-section
        >
          <!-- Video tracks (E1) + subtitle upload (S5-7) -->
          <template v-if="fileStore.req?.type === 'video'">
            <template v-if="videoMeta">
              <div class="preview-info__label">Tracks</div>
              <dl class="preview-info__dl">
                <div class="preview-info__row">
                  <dt>Resolution</dt>
                  <dd class="tabular">
                    {{ videoMeta.width }} × {{ videoMeta.height }}
                  </dd>
                </div>
                <div class="preview-info__row">
                  <dt>Duration</dt>
                  <dd class="tabular">
                    {{ formatDuration(videoMeta.duration) }}
                  </dd>
                </div>
                <div class="preview-info__row">
                  <dt>Subtitles</dt>
                  <dd>
                    {{
                      videoMeta.textTracks === 0 ? "None" : videoMeta.textTracks
                    }}
                  </dd>
                </div>
              </dl>
            </template>

            <!-- Drop zone to add a subtitle for this video (S5-7).
                 Needs create permission (writes a sibling file). -->
            <SubtitleUpload
              v-if="!!authStore.user?.perm.create && name"
              :video-name="name"
              :dir="previewDir"
              @uploaded="onSubtitleUploaded"
            />
          </template>

          <!-- Camera EXIF (E3) — image only. -->
          <template v-if="imageExif">
            <div class="preview-info__label">Camera</div>
            <dl class="preview-info__dl">
              <div v-if="imageExif.camera" class="preview-info__row">
                <dt>Camera</dt>
                <dd>{{ imageExif.camera }}</dd>
              </div>
              <div v-if="imageExif.lens" class="preview-info__row">
                <dt>Lens</dt>
                <dd>{{ imageExif.lens }}</dd>
              </div>
              <div v-if="imageExif.focalLength" class="preview-info__row">
                <dt>Focal length</dt>
                <dd class="tabular">{{ imageExif.focalLength }}</dd>
              </div>
              <div
                v-if="imageExif.exposure || imageExif.iso"
                class="preview-info__row"
              >
                <dt>Exposure</dt>
                <dd class="tabular">
                  <template v-if="imageExif.exposure">
                    {{ imageExif.exposure
                    }}<template v-if="imageExif.iso">
                      · ISO {{ imageExif.iso }}</template
                    >
                  </template>
                  <template v-else-if="imageExif.iso">
                    ISO {{ imageExif.iso }}
                  </template>
                </dd>
              </div>
              <div v-if="imageExif.taken" class="preview-info__row">
                <dt>Taken</dt>
                <dd class="tabular">{{ imageExif.taken }}</dd>
              </div>
            </dl>
          </template>

          <!-- Audio Track + Codec (E2) -->
          <template v-if="audioMeta">
            <div class="preview-info__label">Track</div>
            <!-- Album artwork — extracted from the file's ID3 APIC frame
                 (or equivalent for non-MP3 formats) by music-metadata
                 inside AudioViewer. The blob URL is piped up via the
                 metadata event so we can render it here in the rail
                 alongside the textual tags. Hidden when the file has
                 no embedded artwork — the audio player itself renders
                 a fallback gradient in that case. -->
            <div v-if="audioMeta.artworkUrl" class="preview-info__artwork">
              <img
                :src="audioMeta.artworkUrl"
                :alt="
                  audioMeta.album
                    ? `Album artwork for ${audioMeta.album}`
                    : 'Album artwork'
                "
                loading="lazy"
                draggable="false"
              />
            </div>
            <dl class="preview-info__dl">
              <div v-if="audioMeta.title" class="preview-info__row">
                <dt>Title</dt>
                <dd>{{ audioMeta.title }}</dd>
              </div>
              <div v-if="audioMeta.artist" class="preview-info__row">
                <dt>Artist</dt>
                <dd>{{ audioMeta.artist }}</dd>
              </div>
              <div v-if="audioMeta.album" class="preview-info__row">
                <dt>Album</dt>
                <dd>{{ audioMeta.album }}</dd>
              </div>
              <div v-if="audioMeta.year" class="preview-info__row">
                <dt>Year</dt>
                <dd class="tabular">{{ audioMeta.year }}</dd>
              </div>
              <div v-if="audioMeta.genre" class="preview-info__row">
                <dt>Genre</dt>
                <dd>{{ audioMeta.genre }}</dd>
              </div>
            </dl>

            <div
              v-if="
                audioMeta.codec || audioMeta.bitrate || audioMeta.sampleRate
              "
              class="preview-info__label"
              style="margin-top: 16px"
            >
              Codec
            </div>
            <dl
              v-if="
                audioMeta.codec || audioMeta.bitrate || audioMeta.sampleRate
              "
              class="preview-info__dl"
            >
              <div v-if="audioMeta.codec" class="preview-info__row">
                <dt>Format</dt>
                <dd>{{ audioMeta.codec }}</dd>
              </div>
              <div v-if="audioMeta.bitrate" class="preview-info__row">
                <dt>Bitrate</dt>
                <dd class="tabular">
                  {{ Math.round(audioMeta.bitrate / 1000) }} kbps
                </dd>
              </div>
              <div v-if="audioMeta.sampleRate" class="preview-info__row">
                <dt>Sample rate</dt>
                <dd class="tabular">
                  {{ (audioMeta.sampleRate / 1000).toFixed(1) }} kHz
                </dd>
              </div>
              <div v-if="audioMeta.channels" class="preview-info__row">
                <dt>Channels</dt>
                <dd>
                  {{
                    audioMeta.channels === 1
                      ? "Mono"
                      : audioMeta.channels === 2
                        ? "Stereo"
                        : `${audioMeta.channels} channels`
                  }}
                </dd>
              </div>
            </dl>
          </template>

          <!-- EPUB chapter list / TOC (S5-5). Clickable; the active
               chapter is highlighted. Scrolls within the rail for long
               books. Indentation reflects sub-chapter depth. -->
          <template v-if="isEpub && epubToc.length > 0">
            <div class="preview-info__label">Chapters</div>
            <nav class="preview-epub-toc" aria-label="Table of contents">
              <button
                v-for="(entry, i) in epubToc"
                :key="`${entry.href}-${i}`"
                type="button"
                class="preview-epub-toc__item"
                :class="{
                  'is-active': isActiveChapter(entry),
                }"
                :style="{ paddingLeft: 8 + entry.depth * 14 + 'px' }"
                :title="entry.label"
                @click="goToChapter(entry.href)"
              >
                {{ entry.label || "Untitled" }}
              </button>
            </nav>
          </template>
        </template>

        <template #keyboard-hints>
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd>
            navigate
          </span>
          <span>
            <kbd>Esc</kbd>
            close
          </span>
        </template>
      </PreviewInfoRail>
    </template>
  </PreviewShell>

  <!-- Image editor (S5-4). Canvas-based rotate / flip / crop; saves a
       copy via the upload API. Mounted alongside the shell; self-
       teleports to body. -->
  <ImageEditor
    :open="imageEditorOpen"
    :src="directUrl"
    :name="name"
    :dir="previewDir"
    :existing-names="siblingNames"
    @cancel="imageEditorOpen = false"
    @saved="onImageSaved"
  />
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useStorage, useSwipe } from "@vueuse/core";
import { useTouchDevice } from "@/composables/useTouchDevice";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useRecents } from "@/composables/useRecents";
import { useEpubProgress } from "@/composables/useEpubProgress";
import ImageEditor from "@/components/files/ImageEditor.vue";
import SubtitleUpload from "@/components/files/SubtitleUpload.vue";
import { useLayoutStore } from "@/stores/layout";

import { files as api } from "@/api";
import { createURL } from "@/api/utils";
import { resizePreview, unzipEnabled } from "@/utils/constants";
import url from "@/utils/url";
import { throttle } from "lodash-es";
import { filesize } from "@/utils";
import dayjs from "dayjs";
import exifr from "exifr";
import PreviewShell from "@/components/files/PreviewShell.vue";
import PreviewInfoRail from "@/components/files/PreviewInfoRail.vue";
// ImageViewer stays statically imported. It's the lightest viewer (no
// heavyweight deps) and serves the most common file type — images.
// Lazy-loading it would add a chunk-fetch hitch to the most-traveled
// preview path for ~zero bundle-size savings.
import ImageViewer from "@/components/files/ImageViewer.vue";
// Type-only imports for metadata interfaces stay synchronous —
// TypeScript erases them at compile time, so they don't pull the
// component into the main bundle.
import type { VideoMeta } from "@/components/files/VideoViewer.vue";
import type { EpubTocEntry } from "@/components/files/EpubViewer.vue";
import type { AudioMeta } from "@/components/files/AudioViewer.vue";
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

/**
 * Lazy-loaded format viewers. Each viewer pulls in a heavyweight
 * dependency (pdfjs-dist, video.js, vue-reader + epub.js, ace-builds,
 * music-metadata, etc.) that's only useful when the user is actively
 * previewing that file type. By splitting them via defineAsyncComponent,
 * Vite emits each viewer + its deps as its own chunk that's only fetched
 * on demand. Main bundle drops ~1 MB+; first preview of each format
 * pays a one-time chunk-fetch cost (cached thereafter).
 *
 * We don't pass an `errorComponent` here — if a chunk fails to load
 * the user sees the PreviewShell empty area, which is acceptable for
 * a homelab tool (most likely cause is offline / cache miss; reload
 * fixes it). Adding error UI is a future polish if needed.
 */
const VideoViewer = defineAsyncComponent(
  () => import("@/components/files/VideoViewer.vue")
);
const AudioViewer = defineAsyncComponent(
  () => import("@/components/files/AudioViewer.vue")
);
const PdfViewer = defineAsyncComponent(
  () => import("@/components/files/PdfViewer.vue")
);
const EpubViewer = defineAsyncComponent(
  () => import("@/components/files/EpubViewer.vue")
);
const TextViewer = defineAsyncComponent(
  () => import("@/components/files/TextViewer.vue")
);
const CsvViewer = defineAsyncComponent(
  () => import("@/components/files/CsvViewer.vue")
);
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

// CSV file size limit for preview (5MB).
// Prevents browser memory issues with large files.
const CSV_MAX_SIZE = 5 * 1024 * 1024;

// EPUB reading position (S5-6). PER-BOOK now: a plain ref holding the
// CFI for the *currently-open* book, loaded from useEpubProgress (which
// persists a path→CFI map in user.Preferences, syncing across devices).
// Was a single global "book-progress" localStorage key, which made
// every book resume at the last-read spot of whatever book you opened
// most recently. updatePreview() sets this to the saved CFI when an
// EPUB opens.
const location = ref<string | number>(0);
const epubProgress = useEpubProgress();

// Font size stays a single global preference (not per-book) — kept on
// localStorage as before.
const size = useStorage("book-size", 120, undefined, {
  serializer: {
    read: (v) => JSON.parse(v),
    write: (v) => JSON.stringify(v),
  },
});

// EPUB location + font-size lifting. The full rendition control
// (theme registration, MutationObserver on .dark, font-size hot-swap)
// now lives inside EpubViewer.vue — Preview.vue persists the user's
// last reading position (per book) + font choice.
const locationChange = (epubcifi: string | number) => {
  location.value = epubcifi;
  // Persist against the current book's path so reopening resumes here.
  if (isEpub.value && fileStore.req?.path) {
    epubProgress.set(fileStore.req.path, epubcifi);
  }
};
const changeSize = (val: number) => {
  size.value = val;
};

// ── EPUB table of contents (S5-5) ──────────────────────────────────
// The TOC + current chapter come from EpubViewer via @toc / @chapter.
// The info-rail renders the clickable chapter list; clicks call back
// into the viewer's exposed goTo(href).
const epubViewer = ref<{ goTo: (href: string) => void } | null>(null);
const epubToc = ref<EpubTocEntry[]>([]);
const epubChapter = ref<string>("");

const onEpubToc = (entries: EpubTocEntry[]) => {
  epubToc.value = entries;
};
const onEpubChapter = (href: string) => {
  epubChapter.value = href;
};
const goToChapter = (href: string) => {
  epubViewer.value?.goTo(href);
};

/** Active-row match. TOC hrefs + the relocated href may differ in
 *  anchor (#frag) or path prefix, so compare on the anchor-stripped
 *  basename with a two-way endsWith fallback. */
const isActiveChapter = (entry: EpubTocEntry): boolean => {
  if (!epubChapter.value) return false;
  const base = (h: string) => h.split("#")[0];
  const a = base(entry.href);
  const b = base(epubChapter.value);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
};

/**
 * Whether an item can be reached by the preview's prev/next navigation.
 * Previously the filter only matched image / video / audio / blob,
 * which silently skipped PDFs (when their backend type wasn't blob),
 * text files, EPUBs, and CSVs — the user could land on those only by
 * clicking the row, never by arrow-keying through the folder. Now any
 * non-directory file is fair game; the preview's blob-state fallback
 * handles whatever format we don't render specifically, so the worst
 * case is "no preview" instead of "skipped silently".
 */
const isPreviewable = (item: ResourceItem): boolean => {
  if (item.isDir) return false;
  return true;
};

const previousLink = ref<string>("");
const nextLink = ref<string>("");
const listing = ref<ResourceItem[] | null>(null);
const name = ref<string>("");
const fullSize = ref<boolean>(false);
const showNav = ref<boolean>(true);
const navTimeout = ref<null | number>(null);
const hoverNav = ref<boolean>(false);
const previousRaw = ref<string>("");
const nextRaw = ref<string>("");
const csvContent = ref<ArrayBuffer | string>("");
const csvError = ref<string>("");

// Info rail open/close — persisted across navigations so the user's
// preference sticks. Defaults to true so first-time users see the
// metadata without having to discover the toggle.
const infoOpen = useStorage("preview-info-open", true);

// ── Image zoom state (P2). Persisted so the user's preferred zoom
// carries between images in a session. Fit-to-screen defaults to true
// since most images are bigger than the stage. -------------------
const zoomPercent = ref<number>(100);
const fitToScreen = ref<boolean>(true);

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;

const zoomIn = () => {
  fitToScreen.value = false;
  const next = ZOOM_STEPS.find((s) => s > zoomPercent.value);
  if (next !== undefined) zoomPercent.value = next;
};
const zoomOut = () => {
  fitToScreen.value = false;
  // Walk the steps in reverse to find the largest step below current.
  const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoomPercent.value);
  if (prev !== undefined) zoomPercent.value = prev;
};
const toggleFit = () => {
  fitToScreen.value = !fitToScreen.value;
  if (!fitToScreen.value && !ZOOM_STEPS.includes(zoomPercent.value as never)) {
    zoomPercent.value = 100;
  }
};

// ── Text preview state. content is loaded from fileStore.req.content
// (the backend already returns the body when type is "text" or
// "textImmutable" — same path Editor.vue used). Soft-wrap preference
// persists across previews. ----------------------------------------
const textContent = ref<string>("");
const textSoftWrap = useStorage("preview-text-soft-wrap", false);

// ── Markdown rendered preview (S5-2) ───────────────────────────────
// `.md` / `.markdown` files get a Rendered / Raw toggle in the text
// toolbar. The preference persists across previews (default: rendered,
// since that's what a user opening a markdown file usually wants).
const isMarkdownFile = computed<boolean>(() => {
  const n = fileStore.req?.name?.toLowerCase() ?? "";
  return n.endsWith(".md") || n.endsWith(".markdown");
});
const textRenderMarkdown = useStorage("preview-text-render-markdown", true);

// ── Video metadata (E1). Captured from VideoViewer's @metadata event
// once the underlying <video> reports loadedmetadata. Cleared on
// navigation so the previous video's stats don't show against the new
// file mid-load.
const videoMeta = ref<VideoMeta | null>(null);
const onVideoMetadata = (m: VideoMeta) => {
  videoMeta.value = m;
};

// ── Picture-in-Picture (S5-8) ──────────────────────────────────────
// Template ref to the VideoViewer so the toolbar PiP button can call
// its exposed togglePip(). `videoPip` mirrors the viewer's @pip event
// (browser support + active state) to drive the button's visibility +
// highlight.
const videoViewer = ref<{ togglePip: () => void } | null>(null);
const videoPip = ref<{ supported: boolean; active: boolean }>({
  supported: false,
  active: false,
});
const onVideoPip = (state: { supported: boolean; active: boolean }) => {
  videoPip.value = state;
};

// Audio metadata (E2) — parsed client-side from ID3v2 by AudioViewer.
const audioMeta = ref<AudioMeta | null>(null);
const onAudioMetadata = (m: AudioMeta) => {
  audioMeta.value = m;
};

// ── PDF state (E4). The viewer is driven via two-way binding so the
// toolbar's page-number input + zoom controls can also drive it.
const pdfPage = ref<number>(1);
const pdfTotalPages = ref<number>(0);

const onPdfPageInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const n = parseInt(target.value, 10);
  if (Number.isFinite(n) && n >= 1 && n <= pdfTotalPages.value) {
    pdfPage.value = n;
  } else {
    // Reset display to current page on invalid input.
    target.value = String(pdfPage.value);
  }
};

// ── Image EXIF (E3). Parsed client-side via exifr. We pull only the
// camera-relevant tags (not the full EXIF dump) to keep the rail
// focused. Loader fires when previewUrl changes to an image.
interface ImageExif {
  camera?: string;
  lens?: string;
  exposure?: string;
  iso?: number;
  focalLength?: string;
  taken?: string;
}
const imageExif = ref<ImageExif | null>(null);

const formatExposure = (raw: unknown): string | undefined => {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return;
  // EXIF ExposureTime is in seconds; format as 1/x for short, raw for long.
  if (raw >= 1) return `${raw.toFixed(1)}s`;
  return `1/${Math.round(1 / raw)}s`;
};

const loadImageExif = async (src: string) => {
  if (!src) return;
  try {
    // exifr accepts a URL; uses a Range request internally to pull
    // just the header bytes (~64 KB) — no full-image download for EXIF.
    const parsed = await exifr.parse(src, {
      // Whitelist the tags we surface; everything else is skipped.
      pick: [
        "Make",
        "Model",
        "LensModel",
        "ExposureTime",
        "FNumber",
        "ISO",
        "FocalLength",
        "DateTimeOriginal",
      ],
    });
    if (!parsed) {
      imageExif.value = null;
      return;
    }
    const camera = [parsed.Make, parsed.Model].filter(Boolean).join(" ").trim();
    const focalLength =
      typeof parsed.FocalLength === "number"
        ? `${parsed.FocalLength} mm`
        : undefined;
    const exposure = formatExposure(parsed.ExposureTime);
    const fnum =
      typeof parsed.FNumber === "number"
        ? `f/${parsed.FNumber.toString()}`
        : undefined;
    const exposureLine = [exposure, fnum].filter(Boolean).join(" · ");
    const taken =
      parsed.DateTimeOriginal instanceof Date
        ? dayjs(parsed.DateTimeOriginal).format("MMM D, YYYY · HH:mm")
        : undefined;

    imageExif.value = {
      camera: camera || undefined,
      lens: parsed.LensModel || undefined,
      exposure: exposureLine || undefined,
      iso: typeof parsed.ISO === "number" ? parsed.ISO : undefined,
      focalLength,
      taken,
    };
  } catch {
    imageExif.value = null;
  }
};

const formatDuration = (secs: number): string => {
  if (!Number.isFinite(secs) || secs < 0) return "—";
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};
// `editAsText` closes over route/router which are declared further
// down in the script. The closure resolves at click time, by which
// point both are initialized — safe.
const editAsText = () => {
  router.push({ path: route.path, query: { edit: "true" } });
};

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const authStore = useAuthStore();
const fileStore = useFileStore();
const recents = useRecents();
const layoutStore = useLayoutStore();

const { t } = useI18n();
// Reference these so the linter doesn't trim them — `resizePreview`
// is exported for a future "fullSize" toggle in the toolbar (Stage 11d
// retained the constant); `fullSize.value` is read inside previewUrl().
void resizePreview;
void fullSize.value;

const route = useRoute();
const router = useRouter();

const hasPrevious = computed(() => previousLink.value !== "");
const hasNext = computed(() => nextLink.value !== "");

const downloadUrl = computed(() =>
  fileStore.req ? api.getDownloadURL(fileStore.req, false) : ""
);
const directUrl = computed(() =>
  fileStore.req ? api.getDownloadURL(fileStore.req, true) : ""
);

// ── Image editor (S5-4) ─────────────────────────────────────────────
const imageEditorOpen = ref<boolean>(false);
/** Parent directory route of the current preview — where the edited
 *  copy is written. */
const previewDir = computed(() => url.removeLastDir(route.path) + "/");
/** Sibling filenames in the current folder — for the editor's unique
 *  default name + client-side conflict check. */
const siblingNames = computed<string[]>(
  () => listing.value?.map((it) => it.name) ?? []
);
const onImageSaved = (newName: string) => {
  imageEditorOpen.value = false;
  // Mark the listing stale so the new file appears when the user
  // returns to the folder.
  fileStore.reload = true;
  $showSuccess(`Saved “${newName}”`);
};

const previewUrl = computed(() => {
  if (!fileStore.req) return "";
  if (fileStore.req.type === "image" && !fullSize.value) {
    return api.getPreviewURL(fileStore.req, "big");
  }
  if (isEpub.value) {
    return createURL("api/raw" + fileStore.req.path, {});
  }
  return api.getDownloadURL(fileStore.req, true);
});

const isPdf = computed(() => fileStore.req?.extension.toLowerCase() == ".pdf");
const isEpub = computed(
  () => fileStore.req?.extension.toLowerCase() == ".epub"
);
const isCsv = computed(
  () =>
    fileStore.req?.extension.toLowerCase() == ".csv" &&
    fileStore.req.size <= CSV_MAX_SIZE
);

// .zip in the blob (no-preview) state lights up the Extract CTA (F4).
// canExtractZip mirrors the headerButtons.extract gate from FileListing
// so the action only shows when it would actually succeed.
const isZip = computed(() => fileStore.req?.extension.toLowerCase() === ".zip");
const canExtractZip = computed(
  () => unzipEnabled && !!authStore.user?.perm.create && isZip.value
);
const openExtract = () => layoutStore.showHover("extract");

const subtitles = computed(() => {
  if (fileStore.req?.subtitles) return api.getSubtitlesURL(fileStore.req);
  return [];
});

// ── Subtitle upload (S5-7) ─────────────────────────────────────────
// `videoReloadKey` forces VideoViewer to re-init video.js after a new
// subtitle is uploaded (video.js doesn't pick up <track> elements
// added post-init). `defaultSubtitle` auto-shows the just-uploaded
// track once the player re-initializes.
const videoReloadKey = ref<number>(0);
const defaultSubtitle = ref<string>("");
// Key includes the path so navigating between videos always re-mounts
// the player (video.js can't swap source/tracks in place), and bumps
// on subtitle upload to rebuild the track list.
const videoKey = computed(() => `${route.path}#${videoReloadKey.value}`);

const onSubtitleUploaded = async (savedName: string) => {
  try {
    // Re-fetch the video resource so its `subtitles` list now includes
    // the new file (backend re-runs detectSubtitles on read).
    const fresh = await api.fetch(route.path);
    fileStore.updateRequest(fresh);
    // Find the new track's URL among the refreshed subtitle URLs so it
    // can be auto-enabled — match on the decoded basename.
    await nextTick();
    const match = (subtitles.value as string[]).find((u) => {
      try {
        const base = decodeURIComponent(
          new URL(u, window.location.origin).pathname.split("/").pop() ?? ""
        );
        return base === savedName;
      } catch {
        return false;
      }
    });
    defaultSubtitle.value = match ?? "";
    // Re-mount the player so it builds tracks (incl. the new default).
    videoReloadKey.value++;
    $showSuccess(`Subtitle added: ${savedName}`);
  } catch (e) {
    $showError(
      e instanceof Error ? e : new Error("Couldn't refresh subtitles")
    );
  }
};

// Autoplay defaults off (browsers block it anyway); VideoViewer's
// internal video.js instance manages playback once the user hits play.
const videoOptions = computed(() => ({ autoplay: false }));

// ── Metadata for the toolbar / info rail ─────────────────────────────
const fileType = computed(() => fileStore.req?.type ?? "blob");
const ext = computed(
  () => fileStore.req?.extension?.toLowerCase().replace(/^\./, "") ?? ""
);

const iconName = computed(() => {
  if (isPdf.value) return "file-text";
  if (isEpub.value) return "book-open";
  if (isCsv.value) return "table-2";
  switch (fileType.value) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "music";
    default:
      return "file";
  }
});

const iconColorClass = computed(() => {
  if (isPdf.value) return "is-pdf";
  if (isEpub.value) return "is-epub";
  if (isCsv.value) return "is-csv";
  switch (fileType.value) {
    case "image":
      return "is-image";
    case "video":
      return "is-video";
    case "audio":
      return "is-audio";
    case "text":
    case "textImmutable":
      return "is-text";
    default:
      return "";
  }
});

const typeLabel = computed(() => {
  if (isPdf.value) return "Document · PDF";
  if (isEpub.value) return "Book · EPUB";
  if (isCsv.value) return "Spreadsheet · CSV";
  switch (fileType.value) {
    case "image":
      return ext.value ? `Image · ${ext.value.toUpperCase()}` : "Image";
    case "video":
      return ext.value ? `Video · ${ext.value.toUpperCase()}` : "Video";
    case "audio":
      return ext.value ? `Audio · ${ext.value.toUpperCase()}` : "Audio";
    case "text":
    case "textImmutable":
      return ext.value ? `Text · ${ext.value.toUpperCase()}` : "Text";
    default:
      return "File";
  }
});

const sizeLabel = computed(() =>
  fileStore.req?.size ? filesize(fileStore.req.size) : ""
);

const modifiedLabel = computed(() => {
  if (!fileStore.req?.modified) return "";
  const m = dayjs(fileStore.req.modified);
  return m.isSame(dayjs(), "year")
    ? m.format("MMM D, HH:mm")
    : m.format("MMM D, YYYY");
});

const extensionLabel = computed(() => fileStore.req?.extension ?? "");

const pathLabel = computed(() => fileStore.req?.path ?? "");

const positionLabel = computed(() => {
  if (!listing.value) return "";
  // Index of the currently-previewed file among siblings the preview
  // can navigate to. Same predicate updatePreview uses to wire prev/next.
  const eligibles = listing.value.filter((it) => isPreviewable(it));
  if (eligibles.length === 0) return "";
  const idx = eligibles.findIndex((it) => it.name === name.value);
  if (idx === -1) return "";
  return `${idx + 1} of ${eligibles.length}`;
});

const canOpenDirect = computed(
  () =>
    ["image", "audio", "video"].includes(fileStore.req?.type ?? "") &&
    !!authStore.user?.perm.download
);

// ── Image film-strip: sibling images in the same directory, in source
// order. Used only by the ImageViewer; other formats don't get a strip. -
const imageStrip = computed(() => {
  if (!listing.value) return [];
  return listing.value
    .filter((it) => it.type === "image")
    .map((it) => ({ name: it.name, url: it.url, path: it.path }));
});

const currentItemUrl = computed(() => {
  if (!listing.value) return "";
  const item = listing.value.find((it) => it.name === name.value);
  return item?.url ?? "";
});

// ── Route + lifecycle ────────────────────────────────────────────────
watch(route, () => {
  // Reset per-format metadata so the previous file's stats don't show
  // against the new file during the brief load window.
  videoMeta.value = null;
  videoPip.value = { supported: false, active: false };
  defaultSubtitle.value = "";
  audioMeta.value = null;
  imageExif.value = null;
  epubToc.value = [];
  epubChapter.value = "";
  pdfPage.value = 1;
  pdfTotalPages.value = 0;
  updatePreview();
  toggleNavigation();
});

onMounted(async () => {
  window.addEventListener("keydown", key);
  listing.value = fileStore.oldReq?.items ?? null;
  updatePreview();
});

onBeforeUnmount(() => window.removeEventListener("keydown", key));

// ── Actions ──────────────────────────────────────────────────────────
const deleteFile = () => {
  layoutStore.showHover({
    prompt: "delete",
    confirm: () => {
      if (listing.value === null) return;
      const index = listing.value.findIndex((item) => item.name == name.value);
      listing.value.splice(index, 1);
      if (hasNext.value) {
        next();
      } else if (!hasPrevious.value && !hasNext.value) {
        // After deleting the last item, fall back to selecting the
        // previous neighbor so the user lands somewhere sensible in
        // the listing instead of with an empty selection.
        const nearbyItem = listing.value[Math.max(0, index - 1)];
        if (nearbyItem?.path) {
          fileStore.setPreselect(nearbyItem.path);
        }
        close();
      } else {
        prev();
      }
    },
  });
};

const rename = () => layoutStore.showHover("rename");
const share = () => layoutStore.showHover("share");
const move = () => layoutStore.showHover("move");
const copy = () => layoutStore.showHover("copy");
const download = () => window.open(downloadUrl.value);
const openDirect = () => window.open(directUrl.value);

const prev = () => {
  hoverNav.value = false;
  router.replace({ path: previousLink.value });
};
const next = () => {
  hoverNav.value = false;
  router.replace({ path: nextLink.value });
};

const key = (event: KeyboardEvent) => {
  if (layoutStore.currentPrompt !== null) return;
  // Don't hijack arrows when the user is typing into a form field
  // (e.g. the PDF page-number input in the toolbar, the file-search
  // input, etc.).
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  const typing =
    tag === "input" || tag === "textarea" || target?.isContentEditable;
  if (typing) return;

  const isVideo = fileStore.req?.type === "video";
  const k = event.key;

  // Enter is intentionally a no-op in preview (RC-11): it used to jump to
  // the next file, but the focus trap now lands focus on the dialog
  // container (not the close button), so Enter does nothing at all rather
  // than unexpectedly closing the preview.
  if (k === "ArrowRight") {
    if (isVideo) return;
    if (hasNext.value) {
      event.preventDefault();
      next();
    }
  } else if (k === "ArrowLeft") {
    if (isVideo) return;
    if (hasPrevious.value) {
      event.preventDefault();
      prev();
    }
  } else if (k === "Escape") {
    close();
  }
};

const updatePreview = async () => {
  // The old VideoPlayer/audio player ref-poking lived here to flip
  // autoPlay off if the user paused before navigating. AudioViewer
  // and VideoViewer manage their own playback state now.
  const dirs = route.fullPath.split("/");
  name.value = decodeURIComponent(dirs[dirs.length - 1]);

  // ── Recents tracking (v1.3 S3-1) ──────────────────────────────────
  // Every preview open promotes the file to the front of the recents
  // list. Folder navigation is intentionally NOT tracked — locked
  // decision: recents = "what was I working on", not breadcrumb noise.
  // The composable handles MRU dedup + cap-at-50 + debounced persist.
  if (fileStore.req && !fileStore.req.isDir) {
    recents.track({
      path: fileStore.req.path,
      name: fileStore.req.name,
      isDir: false,
    });
  }

  if (isCsv.value && fileStore.req) {
    csvContent.value = "";
    csvError.value = "";
    if (fileStore.req.size > CSV_MAX_SIZE) {
      csvError.value = t("files.csvTooLarge");
    } else {
      if (fileStore.req.rawContent != null) {
        csvContent.value = fileStore.req.rawContent;
      } else {
        csvContent.value = fileStore.req.content ?? "";
      }
    }
  }

  // Text / textImmutable: surface the body the backend already
  // returned. Same source Editor.vue reads from.
  if (
    fileStore.req &&
    (fileStore.req.type === "text" || fileStore.req.type === "textImmutable")
  ) {
    textContent.value = fileStore.req.content ?? "";
  }

  // Image: kick off client-side EXIF extraction (E3). exifr uses a
  // Range request internally so we don't download the full image.
  if (fileStore.req?.type === "image" && previewUrl.value) {
    void loadImageExif(previewUrl.value);
  }

  // EPUB: resume at the saved per-book position (S5-6). Set BEFORE the
  // viewer renders with the new src so vue-reader opens at the stored
  // CFI; defaults to 0 (start) for a book never opened before.
  if (isEpub.value && fileStore.req?.path) {
    location.value = epubProgress.get(fileStore.req.path);
  }

  if (!listing.value) {
    try {
      const path = url.removeLastDir(route.path);
      const res = await api.fetch(path);
      listing.value = res.items;
    } catch (e: any) {
      $showError(e);
    }
  }

  previousLink.value = "";
  nextLink.value = "";
  if (listing.value) {
    for (let i = 0; i < listing.value.length; i++) {
      if (listing.value[i].name !== name.value) continue;
      for (let j = i - 1; j >= 0; j--) {
        if (isPreviewable(listing.value[j])) {
          previousLink.value = listing.value[j].url;
          previousRaw.value = prefetchUrl(listing.value[j]);
          break;
        }
      }
      for (let j = i + 1; j < listing.value.length; j++) {
        if (isPreviewable(listing.value[j])) {
          nextLink.value = listing.value[j].url;
          nextRaw.value = prefetchUrl(listing.value[j]);
          break;
        }
      }
      return;
    }
  }
};

const prefetchUrl = (item: ResourceItem) => {
  if (item.type !== "image") return "";
  return fullSize.value
    ? api.getDownloadURL(item, true)
    : api.getPreviewURL(item, "big");
};

const toggleNavigation = throttle(function () {
  showNav.value = true;
  if (navTimeout.value) clearTimeout(navTimeout.value);
  navTimeout.value = window.setTimeout(() => {
    showNav.value = false || hoverNav.value;
    navTimeout.value = null;
  }, 1500);
}, 500);
// showNav drives the legacy navigation-fade behavior on the old
// floating chevrons. The new shell always renders the nav arrows
// when there are siblings, so this state is currently inert — kept
// as a no-op `.value` read until the auto-fade is either wired into
// the new shell or formally removed.
void showNav.value;

const close = () => {
  const uri = url.removeLastDir(route.path) + "/";
  router.push({ path: uri });
};

// ── S7-3: touch swipe navigation in the preview ──────────────────────
// Horizontal swipe = prev/next, mirroring the arrow-key rules; plus a
// swipe-down-to-close on a fit image (the one viewer with nothing to
// scroll, so a downward fling can't be mistaken for a scroll gesture).
// Touch-only via the shared gate; vueuse's useSwipe is passive, so it
// never blocks native scroll / pan / pinch.
const stageEl = ref<HTMLElement | null>(null);
const isTouchDevice = useTouchDevice();

// Horizontal nav: not on video/audio (their own transport gestures own
// horizontal drags), and not while an image or PDF is zoomed in (then a
// horizontal drag is a pan). `fitToScreen` is only ever turned off by the
// image/PDF zoom controls, so it doubles as the "not zoomed" signal.
const canSwipeNavigate = computed(() => {
  const t = fileStore.req?.type;
  if (t === "video" || t === "audio") return false;
  return fitToScreen.value;
});
// Swipe-down-to-close only on a fit image — every other viewer either
// scrolls (text / PDF / CSV / EPUB) or owns its own gestures, where a
// downward fling must not be hijacked into a dismiss.
const canSwipeClose = computed(
  () => fileStore.req?.type === "image" && fitToScreen.value
);

const { lengthY } = useSwipe(stageEl, {
  threshold: 60,
  onSwipeEnd(_e, direction) {
    if (!isTouchDevice.value || layoutStore.currentPrompt !== null) return;

    if (direction === "left" || direction === "right") {
      if (!canSwipeNavigate.value) return;
      if (direction === "left" && hasNext.value) next();
      else if (direction === "right" && hasPrevious.value) prev();
    } else if (direction === "down" && canSwipeClose.value) {
      // Require a deliberate downward fling so a small drag doesn't close.
      if (Math.abs(lengthY.value) > 90) close();
    }
  },
});
</script>

<style scoped>
.preview-stage__inner {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  min-width: 0;
  padding: 32px 64px;
  position: relative;
}

@media (max-width: 540px) {
  .preview-stage__inner {
    padding: 16px;
  }
}

.preview-stage__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent, #5e6ad2);
}

.preview-spin {
  animation: preview-spin 0.9s linear infinite;
}

@keyframes preview-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Per-format viewer chrome now lives in each viewer's own SFC; what's
   left here is just the Blob ("no preview") state and the temporary
   zoom-controls used by the toolbar-format slot (image format). */

.preview-blob {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  gap: 12px;
}

.preview-blob__icon {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Archive-orange squircle matches the file-icon system tint for .zip
   files in the listing — visual continuity from row to preview. */
.preview-blob__icon--zip {
  background: rgba(251, 146, 60, 0.16);
  color: #c2410c;
}
html.dark .preview-blob__icon--zip {
  background: rgba(251, 146, 60, 0.22);
  color: #fdba74;
}

.preview-blob__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}

.preview-blob__hint {
  font-size: 13px;
  color: var(--color-ink-3, #a1a1aa);
}

.preview-blob__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.preview-blob__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.preview-blob__btn--primary {
  background: var(--color-accent, #5e6ad2);
  border: 1px solid var(--color-accent, #5e6ad2);
  color: white;
}
.preview-blob__btn--primary:hover {
  background: var(--color-accent-strong, #4f5ac4);
}

.preview-blob__btn--ghost {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}
.preview-blob__btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

/* ── PDF page counter (E4) ─────────────────────────────────────── */
.preview-page {
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.preview-page__input {
  width: 28px;
  height: 24px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: center;
  color: var(--color-ink-1, #18181b);
  outline: none;
  border-radius: 4px;
}
.preview-page__input:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}
.preview-page__sep {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
}

/* ── Zoom + fit toolbar controls (P2 — image) ───────────────────── */
.preview-zoom {
  height: 28px;
  padding: 0 4px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.preview-zoom__btn {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  border-radius: 4px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.preview-zoom__btn:hover:not(:disabled) {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}
.preview-zoom__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.preview-zoom__value {
  font-size: 11.5px;
  color: var(--color-ink-2, #52525b);
  padding: 0 6px;
  min-width: 44px;
  text-align: center;
  user-select: none;
}

.preview-fit__btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
}
.preview-fit__btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.preview-fit__btn.is-active {
  background: var(--color-selected, rgba(94, 106, 210, 0.08));
  color: var(--color-accent, #5e6ad2);
  border-color: transparent;
}

/* ── Toolbar format button with text label ─────────────────────────────
   The "Edit" button in the text-preview toolbar uses this. Sibling to
   `.preview-fit__btn` (the icon-only square) but accommodates an
   icon + text-label pair. Same height + border + colors so the two
   buttons sit side-by-side without visual mismatch. Below the md
   breakpoint the label is hidden via `max-md:hidden` in the template,
   so the button collapses to the same 28px square as preview-fit__btn. */
.preview-toolbar-format__btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
}
.preview-toolbar-format__btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.preview-toolbar-format__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}
/* When the label is hidden at narrow widths, shrink to icon-only square
   so the button matches its sibling `.preview-fit__btn` exactly. */
@media (max-width: 768px) {
  .preview-toolbar-format__btn {
    width: 28px;
    padding: 0;
  }
}

.tabular {
  font-variant-numeric: tabular-nums;
}

/* ── Album artwork in the audio info-rail (D9) ────────────────────────
   Rendered when the file has an embedded APIC (or equivalent) frame
   the parser could extract. Square 1:1, rounded, light shadow so it
   has presence without competing with the player card to its left.
   Margin-bottom matches the gap between the .preview-info__label and
   the dl that follows so the layout reads as one cohesive section. */
.preview-info__artwork {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
  background: var(--color-elevated, #f4f4f5);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 8px 24px -12px rgba(0, 0, 0, 0.18);
}
.preview-info__artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
html.dark .preview-info__artwork {
  background: var(--color-canvas-2, #232327);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.25),
    0 8px 24px -12px rgba(0, 0, 0, 0.5);
}

/* ── EPUB chapter list (S5-5) ────────────────────────────────────────
   Authored in this component's template (passed into the info-rail's
   format-section slot), so Preview's scoped styles match it directly.
   Capped height + scroll so a long book doesn't push the rest of the
   rail off-screen. */
.preview-epub-toc {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
  margin: 0 -6px;
  scrollbar-width: thin;
}
.preview-epub-toc__item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--color-ink-2, #52525b);
  font-size: 12.5px;
  line-height: 1.4;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.preview-epub-toc__item:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}
.preview-epub-toc__item.is-active {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
  font-weight: 600;
}
.preview-epub-toc__item:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: -2px;
}
</style>
