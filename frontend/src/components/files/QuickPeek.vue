<template>
  <Teleport to="body">
    <Transition name="quick-peek">
      <div
        v-if="item"
        class="quick-peek"
        role="dialog"
        aria-modal="true"
        :aria-label="`Preview of ${item.name}`"
        @mousedown.self="close"
      >
        <div class="quick-peek__panel">
          <header class="quick-peek__head">
            <span
              class="quick-peek__chip"
              :class="chipColor"
              aria-hidden="true"
            >
              <Icon :name="chipIcon" :size="15" :stroke-width="1.8" />
            </span>
            <span class="quick-peek__name" :title="item.name">{{
              item.name
            }}</span>
            <span class="quick-peek__meta">{{ metaLabel }}</span>
            <button type="button" class="quick-peek__btn" @click="openFull">
              Open
            </button>
            <button
              type="button"
              class="quick-peek__btn quick-peek__btn--icon"
              aria-label="Close preview"
              @click="close"
            >
              <Icon name="x" :size="16" />
            </button>
          </header>

          <div class="quick-peek__body">
            <img
              v-if="kind === 'image'"
              :key="item.path"
              :src="mediaUrl"
              :alt="item.name"
              class="quick-peek__media"
            />
            <video
              v-else-if="kind === 'video'"
              :key="item.path"
              :src="mediaUrl"
              class="quick-peek__media"
              controls
              autoplay
            />
            <div v-else-if="kind === 'audio'" class="quick-peek__audio">
              <span class="quick-peek__audio-chip" :class="chipColor">
                <Icon :name="chipIcon" :size="28" :stroke-width="1.6" />
              </span>
              <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
              <audio :key="item.path" :src="mediaUrl" controls autoplay />
            </div>
            <object
              v-else-if="kind === 'pdf'"
              :key="item.path"
              :data="mediaUrl"
              type="application/pdf"
              class="quick-peek__doc"
              :aria-label="`Preview of ${item.name}`"
            />
            <iframe
              v-else-if="kind === 'text'"
              :key="item.path"
              :src="mediaUrl"
              sandbox=""
              class="quick-peek__doc quick-peek__doc--text"
              :title="`Contents of ${item.name}`"
            />
            <div v-else class="quick-peek__fallback">
              <span class="quick-peek__fallback-chip" :class="chipColor">
                <Icon :name="chipIcon" :size="34" :stroke-width="1.5" />
              </span>
              <p class="quick-peek__fallback-name">{{ item.name }}</p>
              <p class="quick-peek__fallback-meta">{{ metaLabel }}</p>
              <p class="quick-peek__fallback-hint">
                Press Enter to open this {{ item.isDir ? "folder" : "file" }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import dayjs from "dayjs";
import Icon from "@/components/Icon.vue";
import { files as api } from "@/api";
import { filesize } from "@/utils";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { useQuickPeek } from "@/composables/useQuickPeek";

const { item, close } = useQuickPeek();
const route = useRoute();
const router = useRouter();

// Text files above this size get the fallback card instead of an inline
// frame — the peek is for a glance, not for streaming a 200 MB log.
const TEXT_PEEK_MAX_BYTES = 1024 * 1024;

const kind = computed(() => {
  const it = item.value;
  if (!it || it.isDir) return "other";
  switch (it.type) {
    case "image":
    case "video":
    case "audio":
    case "pdf":
      return it.type;
    case "text":
    case "textImmutable":
      return it.size <= TEXT_PEEK_MAX_BYTES ? "text" : "other";
    default:
      return "other";
  }
});

const mediaUrl = computed(() => {
  const it = item.value;
  if (!it) return "";
  // Images ride the server-resized preview (same as the full Preview view) so
  // a 40 MB photo peeks instantly; everything else streams the raw file.
  if (kind.value === "image") return api.getPreviewURL(it, "big");
  return api.getDownloadURL(it, true);
});

const chipIcon = computed(() => (item.value ? fileIcon(item.value) : "file"));
const chipColor = computed(() => (item.value ? fileIconColor(item.value) : ""));

const metaLabel = computed(() => {
  const it = item.value;
  if (!it) return "";
  const when = dayjs(it.modified).format("MMM D, YYYY");
  return it.isDir ? when : `${filesize(it.size)} · ${when}`;
});

// "Open" = the real thing: route to the item (folder navigation or the full
// preview/editor). The peek closes itself via the route watcher below.
const openFull = () => {
  const it = item.value;
  if (!it) return;
  void router.push({ path: it.url });
};

// Space / Esc close the peek. Registered in the CAPTURE phase so the listing
// keydown handlers (bubble-phase on window) never see them — Esc must not
// also clear the selection, and Space must not start a type-ahead. Arrow keys
// and Enter deliberately fall through: arrows move the selection (the peek
// follows it reactively), Enter opens the item via the pane's own logic.
const onKey = (e: KeyboardEvent) => {
  if (!item.value) return;
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
  if (e.key === "Escape" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
};

onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));

// Navigating anywhere (Enter on a row, Open button, a breadcrumb click)
// dismisses the peek — it belongs to the folder it was opened in.
watch(() => route.fullPath, close);

// The selection moved to nothing (cleared / multi-select / pane emptied) —
// drop the overlay rather than showing a stale frame.
watch(item, (v, old) => {
  if (old && !v) close();
});
</script>

<style scoped>
.quick-peek {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  /* Frosted scrim (v2.7): the blur carries the depth, so the tint can stay
     lighter than a flat scrim would need — matches the frosted corner chips
     and gallery controls. */
  background: rgba(10, 10, 14, 0.35);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.quick-peek__panel {
  display: flex;
  flex-direction: column;
  max-width: min(920px, 90vw);
  max-height: 86vh;
  min-width: 320px;
  overflow: hidden;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  box-shadow:
    0 2px 8px rgba(8, 8, 12, 0.14),
    0 18px 48px rgba(8, 8, 12, 0.22);
}

.quick-peek__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-line);
  flex-shrink: 0;
}

.quick-peek__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex-shrink: 0;
}

.quick-peek__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.quick-peek__meta {
  font-size: 12px;
  color: var(--color-ink-3);
  white-space: nowrap;
  flex: 1;
}

.quick-peek__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 7px;
  border: 1px solid var(--color-line-strong);
  background: transparent;
  color: var(--color-ink-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color var(--dur-base) var(--ease);
}

.quick-peek__btn:hover {
  background: var(--color-hover);
}

.quick-peek__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 1px;
}

.quick-peek__btn--icon {
  width: 28px;
  padding: 0;
}

.quick-peek__body {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  overflow: hidden;
  background: var(--color-canvas);
}

.quick-peek__media {
  display: block;
  max-width: 100%;
  max-height: calc(86vh - 50px);
  object-fit: contain;
}

.quick-peek__audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 36px 48px;
}

.quick-peek__audio-chip,
.quick-peek__fallback-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
}

.quick-peek__doc {
  width: min(860px, 88vw);
  height: calc(86vh - 50px);
  border: 0;
}

.quick-peek__doc--text {
  background: var(--color-surface);
}

.quick-peek__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 56px;
  text-align: center;
}

.quick-peek__fallback-name {
  margin: 10px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-1);
  max-width: 420px;
  overflow-wrap: anywhere;
}

.quick-peek__fallback-meta {
  margin: 0;
  font-size: 12px;
  color: var(--color-ink-3);
}

.quick-peek__fallback-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-ink-4);
}

.quick-peek-enter-active,
.quick-peek-leave-active {
  transition: opacity var(--dur-base) var(--ease);
}

.quick-peek-enter-active .quick-peek__panel,
.quick-peek-leave-active .quick-peek__panel {
  transition: transform var(--dur-base) var(--ease);
}

.quick-peek-enter-from,
.quick-peek-leave-to {
  opacity: 0;
}

.quick-peek-enter-from .quick-peek__panel,
.quick-peek-leave-to .quick-peek__panel {
  transform: scale(0.98);
}

/* Phones (v2.7.2): the desktop 40px gutter + 320px min-width overflowed a
   375px viewport. Slim gutters, let the panel span the screen, and size the
   document frames to match. */
@media (max-width: 640px) {
  .quick-peek {
    padding: 12px;
  }
  .quick-peek__panel {
    min-width: 0;
    width: 100%;
    max-width: calc(100vw - 24px);
    max-height: 92vh;
  }
  .quick-peek__media {
    max-height: calc(92vh - 50px);
  }
  .quick-peek__doc {
    width: 100%;
    height: calc(92vh - 50px);
  }
  .quick-peek__fallback {
    padding: 32px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .quick-peek-enter-active,
  .quick-peek-leave-active,
  .quick-peek-enter-active .quick-peek__panel,
  .quick-peek-leave-active .quick-peek__panel {
    transition: none;
  }
}
</style>
