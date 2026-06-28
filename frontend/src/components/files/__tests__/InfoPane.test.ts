import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { getActivePinia } from "pinia";
import { resetPrefsHarness } from "@/composables/__tests__/_prefsHarness";
import { usePreferences } from "@/composables/usePreferences";
import { useFileStore } from "@/stores/file";
import InfoPane from "@/components/files/InfoPane.vue";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
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
  // jsdom doesn't implement matchMedia; the pane reads it to decide isMobile.
  // Force desktop (matches:false) so we exercise the rail/full-pane branch.
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function mountPane() {
  // shallowMount auto-stubs every child component (Icon, previews, TagChip …),
  // so only InfoPane's own setup deps (Pinia + prefs) need satisfying.
  return shallowMount(InfoPane, {
    global: { plugins: [getActivePinia()!, i18n] },
  });
}

describe("InfoPane.vue — visibility follows the collapse toggle, not selection", () => {
  it("shows the slim rail when collapsed, and a selection does NOT force it open", async () => {
    void usePreferences().set("detailsPaneCollapsed", true);
    const w = mountPane();
    expect(w.find(".info-pane-rail").exists()).toBe(true);
    expect(w.find("aside.info-pane").exists()).toBe(false);

    // Clicking a file selects it — this must NOT pop the pane open anymore.
    useFileStore().selected = [0];
    await w.vm.$nextTick();
    expect(w.find(".info-pane-rail").exists()).toBe(true);
    expect(w.find("aside.info-pane").exists()).toBe(false);
  });

  it("shows the full pane when expanded, independent of selection", async () => {
    void usePreferences().set("detailsPaneCollapsed", false);
    useFileStore().req = {
      url: "/files/F/",
      isDir: true,
      name: "F",
      items: [],
      numDirs: 0,
      numFiles: 0,
    } as unknown as Resource;

    const w = mountPane();
    expect(w.find("aside.info-pane").exists()).toBe(true);
    expect(w.find(".info-pane-rail").exists()).toBe(false);
  });
});
