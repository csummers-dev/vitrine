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

// Sibling-folder menus (v2.7) fetch the parent level's listing on chevron
// click; mock just files.fetch so the tests control what each level contains.
vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    files: { ...actual.files, fetch: vi.fn() },
  };
});
import { files as filesApi } from "@/api";

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

// ── Sibling-folder dropdowns (v2.7) ─────────────────────────────────────
describe("Breadcrumbs.vue sibling menus", () => {
  const dir = (name: string, url: string) =>
    ({ name, url, isDir: true }) as unknown as ResourceItem;
  const file = (name: string) =>
    ({ name, url: `/files/${name}`, isDir: false }) as unknown as ResourceItem;

  // The menu teleports to <body>, outside the wrapper — query the document.
  const menuLabels = () =>
    [...document.body.querySelectorAll(".context-menu__item-label")].map((e) =>
      e.textContent?.trim()
    );

  it("renders the separator chevrons as menu buttons in the files tree", async () => {
    const w = await mountAt("/files/Docs/Reports/");
    const seps = w.findAll("button.breadcrumb-sep");
    expect(seps.length).toBe(2); // one per crumb (Docs, Reports)
    expect(seps[0].attributes("aria-haspopup")).toBe("menu");
    w.unmount();
  });

  it("keeps plain separators outside the files tree (share view) and when noLink", async () => {
    await router.push("/share/abc/Docs/");
    await router.isReady();
    const share = mount(Breadcrumbs, {
      props: { base: "/share/abc" },
      global: { plugins: [router, i18n, pinia], stubs: { Icon: true } },
    });
    expect(share.findAll("button.breadcrumb-sep")).toHaveLength(0);
    share.unmount();

    await router.push("/files/Docs/");
    const noLink = mount(Breadcrumbs, {
      props: { base: "/files", noLink: true },
      global: { plugins: [router, i18n, pinia], stubs: { Icon: true } },
    });
    expect(noLink.findAll("button.breadcrumb-sep")).toHaveLength(0);
    noLink.unmount();
  });

  it("clicking a chevron lists the parent level's folders (dirs only, sorted)", async () => {
    vi.mocked(filesApi.fetch).mockResolvedValue({
      items: [
        file("readme.txt"),
        dir("Music", "/files/Music/"),
        dir("Comics", "/files/Comics/"),
      ],
    } as unknown as Resource);

    const w = await mountAt("/files/Comics/");
    await w.find("button.breadcrumb-sep").trigger("click");
    await flushPromises();

    // Fetched the level ABOVE the crumb (the root for the first chevron).
    expect(vi.mocked(filesApi.fetch)).toHaveBeenCalledWith("/files/");
    // Dirs only, alphabetical; the file never shows.
    expect(menuLabels()).toEqual(["Comics", "Music"]);
    w.unmount();
  });

  it("navigates to the picked sibling", async () => {
    vi.mocked(filesApi.fetch).mockResolvedValue({
      items: [dir("Music", "/files/Music/"), dir("Comics", "/files/Comics/")],
    } as unknown as Resource);

    const w = await mountAt("/files/Comics/");
    await w.find("button.breadcrumb-sep").trigger("click");
    await flushPromises();

    const music = [
      ...document.body.querySelectorAll(".context-menu__item"),
    ].find((el) => el.textContent?.includes("Music")) as HTMLElement;
    music.click();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/files/Music/");
    w.unmount();
  });

  it("shows a disabled placeholder when the level has no subfolders", async () => {
    vi.mocked(filesApi.fetch).mockResolvedValue({
      items: [file("readme.txt")],
    } as unknown as Resource);

    const w = await mountAt("/files/Docs/");
    await w.find("button.breadcrumb-sep").trigger("click");
    await flushPromises();
    expect(menuLabels()).toEqual(["No subfolders"]);
    w.unmount();
  });

  it("opens no menu when the listing fetch fails (perm / network)", async () => {
    vi.mocked(filesApi.fetch).mockRejectedValue(new Error("403"));
    const w = await mountAt("/files/Docs/");
    await w.find("button.breadcrumb-sep").trigger("click");
    await flushPromises();
    expect(document.body.querySelector(".context-menu")).toBeNull();
    w.unmount();
  });
});
