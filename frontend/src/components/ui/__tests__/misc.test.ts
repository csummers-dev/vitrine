import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiChip from "../UiChip.vue";
import UiBadge from "../UiBadge.vue";
import UiProgress from "../UiProgress.vue";
import UiPageHeader from "../UiPageHeader.vue";
import UiPanel from "../UiPanel.vue";
import EmptyState from "@/components/EmptyState.vue";
import Skeleton from "@/components/Skeleton.vue";

describe("UiChip", () => {
  it("is a toggle button with a count", async () => {
    const w = mount(UiChip, {
      props: { pressed: true, count: 4 },
      slots: { default: "Images" },
    });
    expect(w.get("button").attributes("aria-pressed")).toBe("true");
    expect(w.text()).toContain("Images");
    expect(w.text()).toContain("4");
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
  });
});

describe("UiBadge", () => {
  it("caps large counts", () => {
    expect(mount(UiBadge, { props: { count: 12 } }).text()).toBe("12");
    expect(mount(UiBadge, { props: { count: 1200 } }).text()).toBe("999+");
    expect(
      mount(UiBadge, { props: { label: "Failed", tone: "danger" } }).classes()
    ).toContain("ui-badge--danger");
  });
});

describe("UiProgress", () => {
  it("reports its value", () => {
    const w = mount(UiProgress, { props: { value: 30, label: "Upload" } });
    const p = w.get('[role="progressbar"]');
    expect(p.attributes("aria-valuenow")).toBe("30");
    expect(p.attributes("aria-valuemax")).toBe("100");
    expect(p.attributes("aria-label")).toBe("Upload");
  });

  it("is indeterminate without a value, and clamps", () => {
    const i = mount(UiProgress, { props: { label: "Working" } });
    expect(
      i.get('[role="progressbar"]').attributes("aria-valuenow")
    ).toBeUndefined();
    const c = mount(UiProgress, {
      props: { label: "x", value: 140, variant: "ring" },
    });
    expect(c.get('[role="progressbar"]').attributes("aria-valuenow")).toBe(
      "100"
    );
  });
});

describe("UiPageHeader", () => {
  it("renders eyebrow, title, meta and actions", () => {
    const w = mount(UiPageHeader, {
      props: {
        eyebrow: "Library tools",
        title: "Duplicates",
        meta: "3 groups",
        metaAttrs: { "data-testid": "m" },
      },
      slots: { actions: "<button>Scan</button>" },
    });
    expect(w.get("h1").text()).toBe("Duplicates");
    expect(w.get('[data-testid="m"]').text()).toBe("3 groups");
    expect(w.text()).toContain("Library tools");
    expect(w.find(".ui-page-header__actions button").exists()).toBe(true);
  });
});

describe("UiPanel", () => {
  it("is a section named by its title", () => {
    const w = mount(UiPanel, {
      props: { title: "Photo" },
      slots: { default: "body", footer: "<button>OK</button>" },
    });
    const id = w.get("h2").attributes("id");
    expect(w.get("section").attributes("aria-labelledby")).toBe(id);
    expect(w.find(".ui-panel__footer button").exists()).toBe(true);
  });
});

describe("EmptyState", () => {
  it("shows its hint", () => {
    const w = mount(EmptyState, {
      props: { title: "Trash is empty", hint: "Deleted files land here." },
    });
    expect(w.text()).toContain("Deleted files land here.");
  });
});

describe("Skeleton", () => {
  it("draws shapes and stays out of the accessibility tree", () => {
    const w = mount(Skeleton, { props: { shape: "row" } });
    expect(w.classes()).toContain("skeleton--row");
    expect(w.attributes("aria-hidden")).toBe("true");
    const c = mount(Skeleton, { props: { shape: "circle", width: 24 } });
    expect(c.attributes("style")).toContain("height: 24px");
  });
});
