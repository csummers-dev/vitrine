<template>
  <PreviewShell
    :name="name"
    :info-open="infoOpen"
    :fade-chrome="isComic || isPdf"
    @close="close"
    @toggle-info="infoOpen = !infoOpen"
    @user-activity="toggleNavigation"
  >
    <!-- ── Toolbar: format-specific controls ──────────────────────── -->
    <template #toolbar-format>
      <!-- 2.1 #3: text controls (Rendered/Raw · Soft-wrap · Edit) moved OUT of
           this floating pill into the details rail (see the #info slot's "Text"
           section), so the main reading area stays clear and the Exit float
           can't overlap the text. -->

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

      <!-- V3-D #21: the EPUB book light/dark toggle moved OUT of this floating
           bottom pill (it overlapped the reading area) into the details rail —
           see the #info slot's epub "Reading" control below. -->

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
          :title="fitToScreen ? 'Actual' : 'Fit to screen'"
          :aria-label="fitToScreen ? 'Actual' : 'Fit to screen'"
          :aria-pressed="fitToScreen"
          @click="toggleFit"
        >
          <!-- V2 #12: distinct colour from the Edit icon next to it (was lilac,
               same as Edit). Teal reads as the "size/fit" control. -->
          <Icon
            :name="fitToScreen ? 'maximize-2' : 'maximize'"
            :size="14"
            class="text-[var(--c-teal)]"
          />
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
          <!-- V2 #13: colourful (orange) edit icon, not the whole button. -->
          <Icon name="pencil-ruler" :size="14" class="text-[#fb923c]" />
          <span class="max-md:hidden">Edit</span>
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
            :dark="epubDark"
            @update:location="locationChange"
            @update:size="changeSize"
            @navigate-prev="prev"
            @navigate-next="next"
            @toc="onEpubToc"
            @chapter="onEpubChapter"
            @cover="onEpubCover"
          />

          <!-- Comic (CBZ/CBR paged image reader). It owns its own arrow-key
               paging; at the first/last page it forwards @navigate-prev/-next
               so file-to-file nav still works (same contract as EpubViewer). -->
          <ComicViewer
            v-else-if="isComic"
            :path="fileStore.req?.path ?? ''"
            :modified="fileStore.req?.modified ?? ''"
            :name="name"
            @navigate-prev="prev"
            @navigate-next="next"
          />

          <!-- CSV -->
          <CsvViewer
            v-else-if="isCsv"
            :content="csvContent"
            :error="csvError"
          />

          <!-- Image (P2: ImageViewer with zoom / fit). WS10 removed the film
               strip (sibling-image navigation). -->
          <ImageViewer
            v-else-if="fileStore.req?.type == 'image'"
            :src="previewUrl"
            :alt="name"
            :zoom-percent="zoomPercent"
            :fit-to-screen="fitToScreen"
          />

          <!-- Audio (P4: AudioViewer = album card + plain scrubber +
               custom transport. Centered play-pause icon with the
               asymmetric-triangle nudge per design feedback. ID3 APIC
               artwork + tag parsing emit via @metadata — E2). -->
          <!-- WS10: the audio player's own previous/next-TRACK transport stays
               (a media-player convention, distinct from the preview ‹ › arrows
               which were removed). -->
          <AudioViewer
            v-else-if="fileStore.req?.type == 'audio'"
            :src="audioSrc"
            :name="name"
            :cover-fallback-url="audioCoverUrl"
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
            :source="previewUrl"
            :subtitles="subtitles"
            :options="videoOptions"
            :default-subtitle="defaultSubtitle"
            :transcode-source="transcodeUrl"
            :prefer-transcode="preferTranscode"
            :download-url="downloadUrl"
            :direct-url="directUrl"
            @metadata="onVideoMetadata"
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
            v-else-if="isTextView"
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
              :class="isArchive ? 'preview-blob__icon--zip' : ''"
            >
              <Icon
                :name="isArchive ? 'package' : 'file-search'"
                :size="28"
                :stroke-width="1.4"
              />
            </div>
            <div class="preview-blob__title">
              {{ isArchive ? "Archive" : $t("files.noPreview") }}
            </div>
            <div class="preview-blob__hint">
              {{
                isArchive
                  ? "This is a compressed archive. Extract to view the contents."
                  : "This file type can't be previewed in the browser."
              }}
            </div>
            <!-- Archive: no inline actions — the Extract button lives in the
                 details sidebar next to Move/Copy. Non-archive blobs still
                 get Download/Open since there's no equivalent surface
                 for them. -->
            <div v-if="!isArchive" class="preview-blob__actions">
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
        :can-edit-tags="canEditTags"
        :can-open-direct="canOpenDirect"
        @share="share"
        @download="download"
        @rename="rename"
        @delete="deleteFile"
        @move="move"
        @copy="copy"
        @extract="openExtract"
        @edit-tags="openAudioTags"
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
            isEpub ||
            isTextView
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

          <!-- 2.1 #3: text view controls, relocated here from the floating pill
               so the reading area stays clear and Exit can't overlap the text.
               Colorful icons; full-width rail buttons. -->
          <template v-if="isTextView">
            <div class="preview-info__label">Text</div>
            <div class="preview-text-controls">
              <button
                v-if="isMarkdownFile"
                type="button"
                class="preview-text-btn"
                :class="{ 'is-active': textRenderMarkdown }"
                :aria-pressed="textRenderMarkdown"
                @click="textRenderMarkdown = !textRenderMarkdown"
              >
                <Icon
                  :name="textRenderMarkdown ? 'code' : 'book-open'"
                  :size="14"
                  class="text-[var(--c-lilac)]"
                />
                <span>{{
                  textRenderMarkdown ? "Raw source" : "Rendered"
                }}</span>
              </button>
              <button
                v-if="!(isMarkdownFile && textRenderMarkdown)"
                type="button"
                class="preview-text-btn"
                :class="{ 'is-active': textSoftWrap }"
                :aria-pressed="textSoftWrap"
                @click="textSoftWrap = !textSoftWrap"
              >
                <Icon
                  :name="textSoftWrap ? 'wrap-text' : 'pilcrow'"
                  :size="14"
                  class="text-[var(--c-teal)]"
                />
                <span>{{ textSoftWrap ? "Soft wrap" : "No wrap" }}</span>
              </button>
              <button
                v-if="fileStore.req?.type === 'text'"
                type="button"
                class="preview-text-btn"
                @click="editAsText"
              >
                <Icon name="file-pen-line" :size="14" class="text-[#fb923c]" />
                <span>Edit as text</span>
              </button>
            </div>
          </template>

          <!-- V3-D #21: book light/dark reading-theme toggle, relocated here
               from the floating bottom pill (it overlapped the page). A
               centred, thin, medium-length button keeps the same sun/moon
               icons and is the first epub control in the rail. -->
          <template v-if="isEpub">
            <div class="preview-info__label">Reading</div>
            <button
              type="button"
              class="preview-epub-theme-btn"
              :class="{ 'is-active': epubDark }"
              :aria-pressed="epubDark"
              @click="toggleEpubDark"
            >
              <Icon :name="epubDark ? 'sun' : 'moon'" :size="14" />
              <span>{{
                epubDark ? "Light book theme" : "Dark book theme"
              }}</span>
            </button>
          </template>

          <!-- EPUB cover art — shown in the details rail when the book
               declares a cover image (emitted by EpubViewer once metadata
               resolves). -->
          <div v-if="isEpub && epubCoverUrl" class="preview-epub-cover-wrap">
            <img
              :src="epubCoverUrl"
              alt="Book cover"
              class="preview-epub-cover"
            />
          </div>

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
import { usePreferences } from "@/composables/usePreferences";
import ImageEditor from "@/components/files/ImageEditor.vue";
import SubtitleUpload from "@/components/files/SubtitleUpload.vue";
import { useLayoutStore } from "@/stores/layout";

import { files as api } from "@/api";
import {
  resizePreview,
  unzipEnabled,
  transcodeEnabled,
} from "@/utils/constants";
import { isComic as isComicFile, isExtractable } from "@/utils/archive";
import { isAudioTaggable } from "@/utils/audio";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
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
 * dependency (pdfjs-dist, video.js, vue-reader + epub.js,
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
const ComicViewer = defineAsyncComponent(
  () => import("@/components/files/ComicViewer.vue")
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
const epubViewer = ref<{
  goTo: (href: string) => void;
  nextPage: () => void;
  prevPage: () => void;
} | null>(null);
const epubToc = ref<EpubTocEntry[]>([]);
const epubChapter = ref<string>("");
// Cover-art blob URL emitted by EpubViewer once the book metadata resolves
// (empty when the epub has no cover). Shown in the info-rail.
const epubCoverUrl = ref<string>("");

const onEpubToc = (entries: EpubTocEntry[]) => {
  epubToc.value = entries;
};
const onEpubChapter = (href: string) => {
  epubChapter.value = href;
};
const onEpubCover = (url: string) => {
  epubCoverUrl.value = url;
};
const goToChapter = (href: string) => {
  epubViewer.value?.goTo(href);
};

// ── EPUB dark mode (independent of the app theme, remembered) ──────────
// The book's light/dark is its own setting: by default it follows the app
// theme, but the reader's toolbar toggle pins it light or dark regardless of
// the app theme and persists that choice (prefs key `epub.dark`). Stored as
// "light" | "dark" | null, where null = "follow the app theme".
const prefs = usePreferences();
const epubThemeOverride = computed<"light" | "dark" | null>(() =>
  prefs.get<"light" | "dark" | null>("epub.dark", null)
);

// Reactive mirror of the app's resolved theme (the `.dark` class on <html>,
// which useThemePreference toggles). A MutationObserver keeps it live so the
// book follows app-theme changes while no override is set.
const appIsDark = ref(
  typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
);
let appThemeObserver: MutationObserver | null = null;

/** Effective book theme: the override when set, else the app theme. */
const epubDark = computed<boolean>(() => {
  const o = epubThemeOverride.value;
  if (o === "dark") return true;
  if (o === "light") return false;
  return appIsDark.value;
});

const toggleEpubDark = () => {
  // Pin the book to the opposite of whatever it's showing now, and remember.
  void prefs.set("epub.dark", epubDark.value ? "light" : "dark");
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
// persists across previews and defaults ON (matches the Editor, which
// uses "editor-soft-wrap" defaulting true) so long lines wrap instead of
// scrolling sideways out of view. ----------------------------------
const textContent = ref<string>("");
const textSoftWrap = useStorage("preview-text-soft-wrap", true);

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
// #3: on-demand transcode URL for videos. Empty when the server lacks
// ffmpeg, so VideoViewer skips the fallback attempt and shows the download
// card straight away.
const transcodeUrl = computed(() =>
  fileStore.req && transcodeEnabled ? api.getTranscodeURL(fileStore.req) : ""
);

// Containers no browser can decode natively. For these we hand VideoViewer
// the transcode stream up front (when ffmpeg is available) instead of
// waiting for a <video> error that Safari often never fires for e.g. .avi.
// mp4 / webm / ogg / mov are left to native playback with the error-driven
// transcode fallback as a safety net.
const UNPLAYABLE_VIDEO_EXT = new Set([
  "avi",
  "mkv",
  "wmv",
  "flv",
  "ts",
  "m2ts",
  "mts",
  "mpg",
  "mpeg",
  "vob",
  "divx",
  "ogm",
  "rm",
  "rmvb",
  "asf",
  "m2v",
  "3gp",
  "f4v",
]);
const preferTranscode = computed<boolean>(() => {
  if (!transcodeUrl.value) return false;
  const n = fileStore.req?.name ?? "";
  const dot = n.lastIndexOf(".");
  const ext = dot >= 0 ? n.slice(dot + 1).toLowerCase() : "";
  return UNPLAYABLE_VIDEO_EXT.has(ext);
});

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
  $showSuccess(`Saved “${newName}”`);
  // RC-37: show the result on creation instead of waiting for a reload.
  const target = previewDir.value + encodeURIComponent(newName);
  if (target === route.path) {
    // Overwrote the file currently open → re-fetch so the edited bytes
    // (and a fresh preview cache key) load without a manual reload.
    fileStore.reload = true;
  } else {
    // A brand-new file was created → open its preview directly.
    router.push({ path: target });
  }
};

const previewUrl = computed(() => {
  if (!fileStore.req) return "";
  if (fileStore.req.type === "image" && !fullSize.value) {
    return api.getPreviewURL(fileStore.req, "big");
  }
  // RC-44: EPUBs must carry the auth token like every other media URL.
  // The old `createURL("api/raw"+path, {})` sent NO ?auth param, so when
  // the cookie session drifted (same root cause as the RC-18 thumbnail
  // 401s) epub.js's fetch got a 401 and the book never opened. Route it
  // through getDownloadURL, which appends authParam().
  return api.getDownloadURL(fileStore.req, true);
});

// WS7 #4: the audio source with a cache-bust keyed on the file's modified time.
// After a tag save the raw bytes change but the path is identical, so the
// browser would serve the stale cover/tags from cache. The post-save refetch
// (fileStore.reload → Files.fetchData) bumps `modified`; folding it into the URL
// forces AudioViewer to re-fetch + re-parse the new ID3/Vorbis tags + cover.
const audioSrc = computed(() => {
  const base = previewUrl.value;
  if (!base) return "";
  const k = Date.parse(fileStore.req?.modified ?? "") || 0;
  return `${base}${base.includes("?") ? "&" : "?"}k=${k}`;
});

// 2.1 #2: server-side cover thumbnail for audio, handed to AudioViewer as a
// fallback for when the client-side music-metadata parse yields no artwork
// (e.g. .opus, where it throws on the embedded picture). The backend extracts
// the cover reliably for every audio format.
const audioCoverUrl = computed(() =>
  fileStore.req && fileStore.req.type === "audio"
    ? api.getPreviewURL(fileStore.req, "thumb")
    : ""
);

const isPdf = computed(() => fileStore.req?.extension.toLowerCase() == ".pdf");
const isEpub = computed(
  () => fileStore.req?.extension.toLowerCase() == ".epub"
);
const isComic = computed(() => isComicFile(fileStore.req?.name ?? ""));
const isCsv = computed(
  () =>
    fileStore.req?.extension.toLowerCase() == ".csv" &&
    fileStore.req.size <= CSV_MAX_SIZE
);

// True only when the plain-text/code viewer is the body's active viewer — the
// file is text-typed AND not already claimed by an earlier, extension-based
// viewer in the body's v-else-if chain (epub / comic / csv / pdf). The header's
// text-only controls (soft-wrap, edit-as-text) gate on this, so a comic or epub
// the backend happens to type as "text" no longer shows text-editor chrome (WS5).
const isTextView = computed(
  () =>
    (fileStore.req?.type === "text" ||
      fileStore.req?.type === "textImmutable") &&
    !isEpub.value &&
    !isComic.value &&
    !isCsv.value &&
    !isPdf.value
);

// A supported archive in the blob (no-preview) state lights up the Extract
// CTA (F4). canExtractZip mirrors the headerButtons.extract gate from
// FileListing so the action only shows when it would actually succeed.
const isArchive = computed(() => isExtractable(fileStore.req?.name ?? ""));
const canExtractZip = computed(
  () => unzipEnabled && !!authStore.user?.perm.create && isArchive.value
);
const openExtract = () => layoutStore.showHover("extract");

// Edit ID3/Vorbis tags (1.6.0). Surfaced on the audio preview's details rail
// when the file is a taggable audio format and the user can modify it.
const canEditTags = computed(
  () =>
    !!authStore.user?.perm.modify && isAudioTaggable(fileStore.req?.name ?? "")
);
const openAudioTags = () => layoutStore.showHover("audio-tags");

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

// V3-E #13: the details-rail file icon must match the list/grid row icon
// EXACTLY (same glyph, same solid colour, same gradient sheen) — not the dim
// translucent --tint-* chip it used before. Route through the shared
// fileIcon / fileIconColor helpers with the SAME inputs ListingItem uses, so
// the two surfaces can never drift.
const iconBasis = computed(() => ({
  isDir: fileStore.req?.isDir ?? false,
  type: fileStore.req?.type,
  name: fileStore.req?.name ?? name.value,
}));
const iconName = computed(() => fileIcon(iconBasis.value));
const iconColorClass = computed(() => fileIconColor(iconBasis.value));

const typeLabel = computed(() => {
  if (isPdf.value) return "Document · PDF";
  if (isEpub.value) return "Book · EPUB";
  if (isComic.value) return "Comic";
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

const canOpenDirect = computed(
  () =>
    ["image", "audio", "video"].includes(fileStore.req?.type ?? "") &&
    !!authStore.user?.perm.download
);

// WS10 removed the image film strip (sibling-image navigation), so the
// previewStrip + currentItemUrl computeds that fed it are gone.

// ── Route + lifecycle ────────────────────────────────────────────────
watch(route, () => {
  // Reset per-format metadata so the previous file's stats don't show
  // against the new file during the brief load window.
  videoMeta.value = null;
  defaultSubtitle.value = "";
  audioMeta.value = null;
  imageExif.value = null;
  epubToc.value = [];
  epubChapter.value = "";
  epubCoverUrl.value = "";
  pdfPage.value = 1;
  pdfTotalPages.value = 0;
  updatePreview();
  toggleNavigation();
});

onMounted(async () => {
  window.addEventListener("keydown", key);
  // Capture phase — see navKey's doc comment (beats video.js slider keys).
  window.addEventListener("keydown", navKey, true);
  listing.value = fileStore.oldReq?.items ?? null;
  updatePreview();

  // Track the app's resolved theme so the EPUB reader follows it while no
  // per-book override is set. setTheme() rewrites <html class>, so a class
  // observer is the reliable signal (covers light / dark / system).
  appThemeObserver = new MutationObserver(() => {
    appIsDark.value = document.documentElement.classList.contains("dark");
  });
  appThemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", key);
  window.removeEventListener("keydown", navKey, true);
  appThemeObserver?.disconnect();
  appThemeObserver = null;
});

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

/** True only for genuine text-entry targets, where ←/→ should move the
 *  caret rather than navigate files. Range / checkbox / slider inputs and
 *  the video-player controls are intentionally NOT text-entry, so arrows
 *  over them still navigate between files. */
const isTextEntry = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return !["range", "checkbox", "radio", "button", "submit", "reset", "file", "color"].includes(type); // prettier-ignore
  }
  return false;
};

/**
 * WS10: ←/→ now turn PAGES (not files) for paginated docs, bound in the CAPTURE
 * phase so they beat controls that would swallow the arrows. Physical direction:
 * Left = previous page, Right = next page — always, regardless of the document's
 * reading direction (V2 #29 removed the per-PDF RTL toggle; the comic reader is
 * the only place that still flips, and it owns its own keys).
 *
 * The comic reader owns ←/→ internally. EPUB pages live in an iframe whose
 * keydowns never reach this window; EpubViewer forwards them via
 * @navigate-prev / @navigate-next, but this also covers the focus-outside case.
 */
const navKey = (event: KeyboardEvent) => {
  if (layoutStore.currentPrompt !== null) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (event.defaultPrevented) return;
  if (isTextEntry(event.target as HTMLElement | null)) return;
  if (isComic.value) return; // ComicViewer owns ←/→

  const isRight = event.key === "ArrowRight";
  if (isPdf.value) {
    event.preventDefault();
    event.stopPropagation();
    if (isRight) {
      if (pdfPage.value < pdfTotalPages.value) pdfPage.value++;
    } else if (pdfPage.value > 1) {
      pdfPage.value--;
    }
  } else if (isEpub.value) {
    event.preventDefault();
    event.stopPropagation();
    if (isRight) epubViewer.value?.nextPage();
    else epubViewer.value?.prevPage();
  }
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

  const k = event.key;

  // Enter is intentionally a no-op in preview (RC-11). WS10: ↑/↓ paging was
  // removed — page-turn is now ←/→ (handled in navKey). The only key left here
  // is Escape (close). Natural media keys stay with the <audio>/<video> element.
  if (k === "Escape") {
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

    // WS10: left/right swipe file-navigation removed. Swipe-DOWN to dismiss an
    // image is kept — it's a close gesture, not file nav.
    if (direction === "down" && canSwipeClose.value) {
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
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}

.preview-blob__btn--primary {
  background: var(--accent-gradient);
  border: 1px solid var(--color-accent, #5e6ad2);
  color: white;
}
.preview-blob__btn--primary:hover {
  background: var(--accent-gradient-strong);
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease,
    border-color var(--dur-base) ease;
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease,
    border-color var(--dur-base) ease;
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

/* ── EPUB cover art ──────────────────────────────────────────────────
   Shown above the chapter list in the details rail. Constrained so a
   tall cover doesn't dominate the rail; soft card chrome to match. */
/* V3-D #21: book reading-theme toggle in the details rail. A thin, centred,
   medium-length pill (not full-width) with the sun/moon glyph + label. */
.preview-epub-theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 70%;
  max-width: 220px;
  margin: 0 auto 16px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}
.preview-epub-theme-btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.preview-epub-theme-btn.is-active {
  background: var(--color-selected, rgba(94, 106, 210, 0.08));
  border-color: transparent;
  color: var(--color-accent-ink, #5e6ad2);
}

/* 2.1 #3: text-view controls in the details rail — full-width stacked buttons
   with colorful glyphs, mirroring the rail's other action chrome. */
.preview-text-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.preview-text-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}
.preview-text-btn:hover {
  background: var(--color-elevated, #f4f4f5);
}
.preview-text-btn.is-active {
  background: var(--color-selected, rgba(94, 106, 210, 0.08));
  border-color: transparent;
}

.preview-epub-cover-wrap {
  display: flex;
  justify-content: center;
  margin: 0 0 16px;
}
.preview-epub-cover {
  max-width: 100%;
  max-height: 240px;
  width: auto;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 8px 24px -10px rgba(0, 0, 0, 0.4);
  background: var(--color-elevated, #f4f4f5);
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
  /* Don't let the column flex compress rows when the chapter list overflows
     its max-height — without this they shrink below their text height and the
     labels overlap. They scroll instead (the nav has overflow-y: auto). */
  flex-shrink: 0;
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
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
