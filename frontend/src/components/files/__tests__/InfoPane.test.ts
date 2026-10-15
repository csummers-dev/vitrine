import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { getActivePinia } from "pinia";
import { nextTick } from "vue";
import { resetPrefsHarness } from "@/composables/__tests__/_prefsHarness";
import { usePreferences } from "@/composables/usePreferences";
import { useFileStore } from "@/stores/file";
import {
  DETAILS_OPEN_PREF,
  __setDetailsWidth,
  detailsModeFor,
  resolveDetailsOpen,
  useDetailsPanel,
} from "@/composables/useDetailsPanel";
import InfoPane from "@/components/files/InfoPane.vue";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("vue-router", async (orig) => ({
  ...(await orig<typeof import("vue-router")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: {} },
});

beforeEach(() => {
  resetPrefsHarness();
  __setDetailsWidth(1440);
});

function mountPane() {
  return shallowMount(InfoPane, {
    global: { plugins: [getActivePinia()!, i18n], renderStubDefaultSlot: true },
  });
}

const item = (over: Partial<ResourceItem>): ResourceItem =>
  ({
    name: "a.txt",
    path: "/a.txt",
    url: "/files/a.txt",
    isDir: false,
    type: "blob",
    size: 100,
    modified: "2026-10-01T10:00:00Z",
    extension: ".txt",
    index: 0,
    ...over,
  }) as unknown as ResourceItem;

function setListing(items: ResourceItem[]) {
  const fs = useFileStore();
  fs.req = {
    name: "Docs",
    path: "/Docs",
    url: "/files/Docs/",
    isDir: true,
    items: items.map((it, index) => ({ ...it, index })),
    numDirs: items.filter((i) => i.isDir).length,
    numFiles: items.filter((i) => !i.isDir).length,
    modified: "2026-10-01T10:00:00Z",
  } as unknown as Resource;
  return fs;
}

describe("details panel layout (Decision 7)", () => {
  it("docks from 1100 px, floats over the list below, sheets on phones", () => {
    expect(detailsModeFor(1440)).toBe("docked");
    expect(detailsModeFor(1100)).toBe("docked");
    expect(detailsModeFor(1099)).toBe("overlay");
    expect(detailsModeFor(768)).toBe("overlay");
    expect(detailsModeFor(767)).toBe("sheet");
  });

  it("opens by default at 1280 px and wider, closed below", () => {
    const t = { saved: undefined, transient: false };
    expect(resolveDetailsOpen({ ...t, width: 1280 })).toBe(true);
    expect(resolveDetailsOpen({ ...t, width: 1279 })).toBe(false);
  });

  it("follows the remembered choice when docked", () => {
    expect(
      resolveDetailsOpen({ width: 1440, saved: false, transient: true })
    ).toBe(false);
    expect(
      resolveDetailsOpen({ width: 1150, saved: true, transient: false })
    ).toBe(true);
  });

  it("never remembers an overlay or sheet", () => {
    expect(
      resolveDetailsOpen({ width: 900, saved: true, transient: false })
    ).toBe(false);
    __setDetailsWidth(900);
    const p = useDetailsPanel();
    p.show();
    expect(p.isOpen.value).toBe(true);
    expect(usePreferences().get(DETAILS_OPEN_PREF, null)).toBeNull();
  });

  it("remembers the toggle when docked", () => {
    const p = useDetailsPanel();
    expect(p.isOpen.value).toBe(true);
    p.toggle();
    expect(p.isOpen.value).toBe(false);
    expect(usePreferences().get(DETAILS_OPEN_PREF, null)).toBe(false);
  });
});

describe("InfoPane.vue", () => {
  it("renders nothing while closed", () => {
    void usePreferences().set(DETAILS_OPEN_PREF, false);
    const w = mountPane();
    expect(w.find('[data-testid="details-panel"]').exists()).toBe(false);
  });

  it("shows the folder on screen when nothing is selected", () => {
    setListing([item({ name: "x", isDir: true, type: "dir" })]);
    const w = mountPane();
    expect(w.find('[data-testid="details-folder"]').text()).toContain("Docs");
    expect(w.text()).toContain("1 item");
  });

  it("sums several items and names their kinds", async () => {
    const fs = setListing([
      item({ name: "a.jpg", type: "image", size: 1024 }),
      item({ name: "b.jpg", type: "image", size: 1024 }),
      item({ name: "c.pdf", type: "pdf", size: 2048 }),
    ]);
    fs.selected = [0, 1, 2];
    const w = mountPane();
    await nextTick();
    const multi = w.find('[data-testid="details-multi"]');
    expect(multi.text()).toContain("3 items selected");
    expect(multi.text()).toContain("4 KiB");
    expect(w.text()).toContain("Images");
    expect(w.text()).toContain("PDF document");
  });

  it("offers Play for media and Open for everything else", async () => {
    const fs = setListing([
      item({ name: "m.mp4", type: "video" }),
      item({ name: "n.txt", type: "blob" }),
    ]);
    fs.selected = [0];
    const w = mountPane();
    await nextTick();
    expect(w.find('[data-testid="details-open"]').text()).toBe("Play");
    fs.selected = [1];
    await nextTick();
    expect(w.find('[data-testid="details-open"]').text()).toBe("Open");
  });

  it("shows a scrim only when floating over the list", async () => {
    __setDetailsWidth(900);
    useDetailsPanel().show();
    const w = mountPane();
    await nextTick();
    expect(w.find('[data-testid="details-scrim"]').exists()).toBe(true);
    await w.find('[data-testid="details-scrim"]').trigger("click");
    expect(w.find('[data-testid="details-panel"]').exists()).toBe(false);
  });
});
