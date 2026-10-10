<template>
  <Teleport to="body">
    <div
      v-if="pm.isOpen.value"
      class="photo-map"
      role="dialog"
      aria-modal="true"
      :aria-label="`Photo map · ${pm.title.value}`"
      data-testid="photo-map"
      @keydown.esc.stop="close"
    >
      <div class="photo-map__panel">
        <header class="photo-map__head">
          <Icon name="map" :size="16" />
          <h2 class="photo-map__title truncate">{{ pm.title.value }}</h2>
          <span class="photo-map__status" data-testid="photo-map-status">{{
            status
          }}</span>
          <button
            v-if="located.length > 0"
            type="button"
            class="photo-map__btn"
            @click="slideshowAll"
          >
            <Icon name="play" :size="13" />
            <span>Slideshow</span>
          </button>
          <button
            ref="closeBtn"
            type="button"
            class="photo-map__icon"
            aria-label="Close map"
            @click="close"
          >
            <Icon name="x" :size="16" />
          </button>
        </header>
        <div v-if="loading" class="photo-map__progress" aria-hidden="true">
          <span :style="{ width: `${progressPct}%` }" />
        </div>
        <div ref="mapEl" class="photo-map__map">
          <div v-if="!loading && located.length === 0" class="photo-map__empty">
            <Icon name="map-pin-off" :size="28" :stroke-width="1.4" />
            <span>None of these photos has a location.</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type * as Leaflet from "leaflet";
import Icon from "@/components/Icon.vue";
import {
  clusterPoints,
  locatePhotos,
  usePhotoMap,
  type GeoPhoto,
} from "@/composables/usePhotoGeo";
import { useSlideshow } from "@/composables/useSlideshow";
import { useAuthStore } from "@/stores/auth";
import { baseURL } from "@/utils/constants";
import { files as api } from "@/api";

const pm = usePhotoMap();
const slideshow = useSlideshow();
const router = useRouter();
const mapEl = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLElement | null>(null);

const loading = ref(false);
const done = ref(0);
const total = ref(0);
const located = ref<GeoPhoto[]>([]);
const progressPct = computed(() =>
  total.value ? Math.round((done.value / total.value) * 100) : 0
);
const status = computed(() => {
  if (loading.value) return `Reading locations… ${done.value} / ${total.value}`;
  const n = pm.photos.value.length;
  return `${located.value.length} of ${n} photo${n === 1 ? "" : "s"} on the map`;
});

let L: typeof Leaflet | null = null;
let map: Leaflet.Map | null = null;
let layer: Leaflet.LayerGroup | null = null;
let abort: AbortController | null = null;

const thumbUrl = (p: GeoPhoto) =>
  api.getPreviewURL(
    { path: p.path, modified: p.modified } as ResourceItem,
    "thumb"
  );

// Tiles come from vitrine (/api/tiles), which fetches and caches them, so
// the page's Content-Security-Policy needs no outside hosts. <img> tiles
// can't send X-Auth, hence ?auth like other media URLs.
const tileTemplate = () => {
  const jwt = useAuthStore().jwt;
  const base = baseURL.replace(/\/$/, "");
  return `${base}/api/tiles/{z}/{x}/{y}${jwt ? `?auth=${encodeURIComponent(jwt)}` : ""}`;
};

function markerHtml(cluster: GeoPhoto[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "photo-map__pin";
  const img = document.createElement("img");
  img.src = thumbUrl(cluster[0]);
  img.alt = "";
  img.loading = "lazy";
  el.appendChild(img);
  if (cluster.length > 1) {
    const badge = document.createElement("span");
    badge.className = "photo-map__count";
    badge.textContent = String(cluster.length);
    el.appendChild(badge);
  }
  return el;
}

function openPhoto(p: GeoPhoto) {
  close();
  const enc = p.path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  void router.push(`/files${enc}`);
}

function renderMarkers() {
  if (!L || !map || !layer) return;
  layer.clearLayers();
  const m = map;
  const clusters = clusterPoints(located.value, (p) =>
    m.project([p.lat, p.lon], m.getZoom())
  );
  for (const c of clusters) {
    const lat = c.reduce((s, p) => s + p.lat, 0) / c.length;
    const lon = c.reduce((s, p) => s + p.lon, 0) / c.length;
    const marker = L.marker([lat, lon], {
      icon: L.divIcon({
        html: markerHtml(c),
        className: "photo-map__icon-wrap",
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      title: c.length === 1 ? c[0].name : `${c.length} photos`,
      keyboard: true,
    });
    marker.on("click", () => {
      if (c.length === 1) return openPhoto(c[0]);
      const bounds = L!.latLngBounds(c.map((p) => [p.lat, p.lon]));
      // Already as close as it gets (same spot): show them as a slideshow.
      if (
        m.getZoom() >= m.getMaxZoom() - 1 ||
        bounds.getNorthEast().equals(bounds.getSouthWest())
      ) {
        close();
        slideshow.open(c);
        return;
      }
      m.fitBounds(bounds, { padding: [48, 48], maxZoom: m.getMaxZoom() });
    });
    layer.addLayer(marker);
  }
}

async function ensureMap() {
  if (map || !mapEl.value) return;
  const mod = await import("leaflet");
  await import("leaflet/dist/leaflet.css");
  L = mod.default ?? (mod as unknown as typeof Leaflet);
  map = L.map(mapEl.value, { worldCopyJump: true, maxZoom: 18 });
  L.tileLayer(tileTemplate(), {
    maxZoom: 18,
    attribution: mapAttribution,
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on("zoomend", renderMarkers);
  map.setView([20, 0], 2);
}

const mapAttribution =
  window.FileBrowser.MapAttribution ??
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

function fit() {
  if (!L || !map || located.value.length === 0) return;
  const bounds = L.latLngBounds(located.value.map((p) => [p.lat, p.lon]));
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
}

async function start() {
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  located.value = [];
  done.value = 0;
  total.value = pm.photos.value.length;
  loading.value = true;
  await nextTick();
  closeBtn.value?.focus();
  await ensureMap();
  const res = await locatePhotos(pm.photos.value, {
    signal,
    onProgress: (d, t) => {
      done.value = d;
      total.value = t;
    },
  });
  if (signal.aborted) return;
  located.value = res;
  loading.value = false;
  map?.invalidateSize();
  fit();
  renderMarkers();
}

function teardown() {
  abort?.abort();
  abort = null;
  map?.remove();
  map = null;
  layer = null;
  loading.value = false;
}

function close() {
  pm.close();
}

function slideshowAll() {
  const photos = located.value;
  close();
  slideshow.open(photos);
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && pm.isOpen.value) {
    e.stopPropagation();
    close();
  }
};

watch(
  () => pm.isOpen.value,
  (open) => {
    if (open) {
      window.addEventListener("keydown", onKey, true);
      void start();
    } else {
      window.removeEventListener("keydown", onKey, true);
      teardown();
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey, true);
  teardown();
});
</script>

<style scoped>
.photo-map {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(10, 10, 12, 0.5);
  display: flex;
  padding: 24px;
}
.photo-map__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  background: var(--color-surface, #fff);
  box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.5);
}
.photo-map__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-1, #18181b);
}
.photo-map__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
}
.photo-map__status {
  flex: 1;
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
}
.photo-map__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.photo-map__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.photo-map__icon:hover,
.photo-map__btn:hover {
  background: var(--color-elevated, #f4f4f5);
}
.photo-map__progress {
  height: 3px;
  background: var(--color-line, #ececec);
}
.photo-map__progress span {
  display: block;
  height: 100%;
  background: var(--color-accent, #6e72d9);
  transition: width 0.2s ease;
}
.photo-map__map {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--color-elevated, #f4f4f5);
}
.photo-map__empty {
  position: absolute;
  inset: 0;
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  background: var(--color-surface, #fff);
}
:deep(.photo-map__icon-wrap) {
  background: none;
  border: 0;
}
:deep(.photo-map__pin) {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 2px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  background: #ddd;
  cursor: pointer;
}
:deep(.photo-map__pin img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
:deep(.photo-map__count) {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-accent, #6e72d9);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}
@media (max-width: 767px) {
  .photo-map {
    padding: 0;
  }
  .photo-map__panel {
    border-radius: 0;
  }
}
</style>
