import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ref } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import QuickPeek from "@/components/files/QuickPeek.vue";
import {
  useQuickPeek,
  __resetQuickPeekForTests,
} from "@/composables/useQuickPeek";

// The overlay teleports to <body>; query the document, not the wrapper.
const overlay = () => document.body.querySelector(".quick-peek");

const item = (over: Partial<ResourceItem>): ResourceItem =>
  ({
    index: 0,
    name: "a.txt",
    path: "/A/a.txt",
    url: "/files/A/a.txt",
    size: 10,
    extension: ".txt",
    modified: "2026-07-01T12:00:00Z",
    mode: 0,
    isDir: false,
    isSymlink: false,
    type: "text",
    ...over,
  }) as ResourceItem;

let router: Router;
let w: VueWrapper | null = null;

beforeEach(() => {
  setActivePinia(createPinia());
  __resetQuickPeekForTests();
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
});

afterEach(() => {
  w?.unmount();
  w = null;
});

async function mountPeek() {
  await router.push("/files/A/");
  await router.isReady();
  const wrapper = mount(QuickPeek, {
    global: {
      plugins: [router, createPinia()],
      stubs: { Icon: true },
    },
  });
  w = wrapper;
  await flushPromises();
  return wrapper;
}

describe("QuickPeek.vue", () => {
  it("renders nothing while closed", async () => {
    await mountPeek();
    expect(overlay()).toBeNull();
  });

  it("shows an image via the server-resized big preview", async () => {
    const img = item({
      name: "photo.png",
      type: "image",
      extension: ".png",
      path: "/A/photo.png",
    });
    await mountPeek();
    useQuickPeek().open(() => img);
    await flushPromises();
    expect(overlay()).not.toBeNull();
    expect(overlay()?.querySelector(".quick-peek__name")?.textContent).toBe(
      "photo.png"
    );
    const src = overlay()
      ?.querySelector("img.quick-peek__media")
      ?.getAttribute("src");
    expect(src).toContain("/api/preview/big");
  });

  it("inlines small text but falls back to the info card for huge logs", async () => {
    await mountPeek();
    const peek = useQuickPeek();

    peek.open(() => item({ size: 1024 }));
    await flushPromises();
    expect(overlay()?.querySelector("iframe.quick-peek__doc")).not.toBeNull();

    peek.close();
    peek.open(() => item({ name: "huge.log", size: 50 * 1024 * 1024 }));
    await flushPromises();
    expect(overlay()?.querySelector("iframe")).toBeNull();
    expect(overlay()?.querySelector(".quick-peek__fallback")).not.toBeNull();
  });

  it("gives folders the fallback card with an Enter hint", async () => {
    await mountPeek();
    useQuickPeek().open(() =>
      item({ name: "Comics", isDir: true, type: "dir", extension: "" })
    );
    await flushPromises();
    expect(
      overlay()?.querySelector(".quick-peek__fallback-hint")?.textContent
    ).toContain("folder");
  });

  it("follows the getter when the underlying selection moves (arrow keys)", async () => {
    await mountPeek();
    // Reactive source, like the pane stores the real getters read.
    const current = ref(item({ name: "one.txt" }));
    useQuickPeek().open(() => current.value);
    await flushPromises();
    expect(overlay()?.querySelector(".quick-peek__name")?.textContent).toBe(
      "one.txt"
    );
    current.value = item({ name: "two.txt", path: "/A/two.txt" });
    await flushPromises();
    expect(overlay()?.querySelector(".quick-peek__name")?.textContent).toBe(
      "two.txt"
    );
  });

  it("closes on Escape (capture) without the event reaching bubble listeners", async () => {
    await mountPeek();
    const peek = useQuickPeek();
    peek.open(() => item({}));
    await flushPromises();

    // A bubble-phase window listener stands in for the listing keydown
    // handler — the peek's capture handler must starve it of the event.
    const listing = vi.fn();
    window.addEventListener("keydown", listing);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
    window.removeEventListener("keydown", listing);

    expect(peek.active.value).toBe(false);
    expect(listing).not.toHaveBeenCalled();
  });

  it("ignores Space while typing in an input (command palette open above)", async () => {
    await mountPeek();
    const peek = useQuickPeek();
    peek.open(() => item({}));
    await flushPromises();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true })
    );
    expect(peek.active.value).toBe(true); // still open — typing wins
    input.remove();
  });

  it("dismisses itself on navigation", async () => {
    await mountPeek();
    const peek = useQuickPeek();
    peek.open(() => item({}));
    await flushPromises();
    await router.push("/files/B/");
    await flushPromises();
    expect(peek.active.value).toBe(false);
  });
});
