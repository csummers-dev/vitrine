import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiIconButton from "../UiIconButton.vue";

describe("UiIconButton", () => {
  it("is named by its label, which is also the tooltip", () => {
    const w = mount(UiIconButton, {
      props: { icon: "search", label: "Search" },
    });
    const b = w.get("button");
    expect(b.attributes("aria-label")).toBe("Search");
    expect(b.attributes("title")).toBe("Search");
    expect(b.attributes("aria-pressed")).toBeUndefined();
  });

  it("announces a pressed state only for toggle buttons", () => {
    const on = mount(UiIconButton, {
      props: { icon: "list", label: "List", pressed: true },
    });
    const off = mount(UiIconButton, {
      props: { icon: "list", label: "List", pressed: false },
    });
    expect(on.get("button").attributes("aria-pressed")).toBe("true");
    expect(off.get("button").attributes("aria-pressed")).toBe("false");
  });

  it("emits click", async () => {
    const w = mount(UiIconButton, { props: { icon: "x", label: "Close" } });
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
  });
});
