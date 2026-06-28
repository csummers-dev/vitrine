import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import { useFileStore } from "@/stores/file";

// useDropTarget pulls in the whole transfer pipeline; stub it so mounting only
// needs Breadcrumbs' own graph. performDrop isn't exercised here — these tests
// cover rendering + drop-target wiring + the drag-state class, not the move.
vi.mock("@/composables/useDropTarget", () => ({
  useDropTarget: () => ({ performDrop: vi.fn() }),
}));

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: {} },
});

let pinia: Pinia;
let router: Router;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
});

async function mountAt(path: string) {
  await router.push(path);
  await router.isReady();
  return mount(Breadcrumbs, {
    props: { base: "/files" },
    global: { plugins: [router, i18n, pinia], stubs: { Icon: true } },
  });
}

describe("Breadcrumbs.vue", () => {
  it("renders one crumb per path segment, last = current folder", async () => {
    const w = await mountAt("/files/Docs/Reports/");
    const texts = w
      .findAll(".breadcrumb-link__text")
      .map((c) => c.text())
      .filter(Boolean);
    expect(texts).toEqual(["Docs", "Reports"]);
    const current = w.find(".breadcrumb-link--current .breadcrumb-link__text");
    expect(current.text()).toBe("Reports");
  });

  it("gives every crumb (incl. root) a data-drop-url drag target", async () => {
    const w = await mountAt("/files/Docs/Reports/");
    const urls = w
      .findAll(".breadcrumb-link")
      .map((c) => c.attributes("data-drop-url"));
    expect(urls).toContain("/files/"); // root / home
    expect(urls).toContain("/files/Docs/");
    expect(urls).toContain("/files/Docs/Reports/");
  });

  it("enlarges the drop targets (drag class) only while a drag is in progress", async () => {
    const w = await mountAt("/files/Docs/");
    const nav = w.find(".breadcrumbs-nav");
    expect(nav.classes()).not.toContain("breadcrumbs-nav--drag");

    // A drag begins → ListingItem populates fileStore.draggedItems.
    useFileStore().draggedItems = [
      { url: "/files/Docs/a.txt" } as unknown as ResourceItem,
    ];
    await flushPromises();
    expect(nav.classes()).toContain("breadcrumbs-nav--drag");

    // Drag ends → cleared → resting state.
    useFileStore().draggedItems = [];
    await flushPromises();
    expect(nav.classes()).not.toContain("breadcrumbs-nav--drag");
  });

  it("emphasizes only the current crumb and not the ancestors", async () => {
    const w = await mountAt("/files/Docs/Reports/");
    expect(w.findAll(".breadcrumb-link--current")).toHaveLength(1);
    expect(w.findAll(".breadcrumb-link--crumb").length).toBeGreaterThan(0);
  });
});
