import { describe, it, expect, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useQuickPeek,
  __resetQuickPeekForTests,
} from "@/composables/useQuickPeek";

const fakeItem = (name: string): ResourceItem =>
  ({
    index: 0,
    name,
    path: `/A/${name}`,
    url: `/files/A/${name}`,
    size: 10,
    extension: ".txt",
    modified: "2026-07-01T12:00:00Z",
    mode: 0,
    isDir: false,
    isSymlink: false,
    type: "text",
  }) as ResourceItem;

beforeEach(() => __resetQuickPeekForTests());

describe("useQuickPeek", () => {
  it("open() shows whatever the getter currently yields", () => {
    const { open, item, active } = useQuickPeek();
    // The getter must read REACTIVE state (in the app it reads the pane
    // stores) — a plain variable wouldn't re-trigger the item computed.
    const current = ref<ResourceItem | null>(fakeItem("a.txt"));
    open(() => current.value);
    expect(active.value).toBe(true);
    expect(item.value?.name).toBe("a.txt");

    // The peek follows the SELECTION, not a snapshot: when the getter's
    // source changes (arrow key moved the selection), item tracks it.
    current.value = fakeItem("b.txt");
    expect(item.value?.name).toBe("b.txt");
  });

  it("yields null (auto-close signal) when the getter dries up", () => {
    const { open, item } = useQuickPeek();
    const current = ref<ResourceItem | null>(fakeItem("a.txt"));
    open(() => current.value);
    current.value = null; // selection cleared / multi-select
    expect(item.value).toBeNull();
  });

  it("close() drops both the open state and the getter", () => {
    const { open, close, item, active } = useQuickPeek();
    open(() => fakeItem("a.txt"));
    close();
    expect(active.value).toBe(false);
    expect(item.value).toBeNull();
  });

  it("toggle() opens when closed and closes when open (Space semantics)", () => {
    const { toggle, active, item } = useQuickPeek();
    toggle(() => fakeItem("a.txt"));
    expect(active.value).toBe(true);
    // A second Space closes — even from a different pane's getter.
    toggle(() => fakeItem("other.txt"));
    expect(active.value).toBe(false);
    expect(item.value).toBeNull();
  });

  it("is a singleton: two callers share one state", () => {
    const paneA = useQuickPeek();
    const paneB = useQuickPeek();
    paneA.open(() => fakeItem("a.txt"));
    expect(paneB.item.value?.name).toBe("a.txt");
    paneB.close();
    expect(paneA.active.value).toBe(false);
  });
});
