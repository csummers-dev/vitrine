import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiButton from "../UiButton.vue";

describe("UiButton", () => {
  it("renders a type=button with the variant and size classes", () => {
    const w = mount(UiButton, {
      props: { variant: "primary", size: "sm" },
      slots: { default: "Save" },
    });
    const b = w.get("button");
    expect(b.attributes("type")).toBe("button");
    expect(b.classes()).toContain("ui-btn--primary");
    expect(b.classes()).toContain("ui-btn--sm");
    expect(b.text()).toBe("Save");
  });

  it("emits click and can submit forms", async () => {
    const w = mount(UiButton, {
      props: { type: "submit" },
      slots: { default: "Go" },
    });
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
    expect(w.get("button").attributes("type")).toBe("submit");
  });

  it("is busy and disabled while loading, keeping its label for the name", () => {
    const w = mount(UiButton, {
      props: { loading: true },
      slots: { default: "Saving" },
    });
    const b = w.get("button");
    expect(b.attributes("aria-busy")).toBe("true");
    expect(b.attributes("disabled")).toBeDefined();
    expect(b.text()).toBe("Saving");
    expect(w.find(".ui-btn__spinner").exists()).toBe(true);
  });

  it("says why it is disabled", () => {
    const w = mount(UiButton, {
      props: { disabled: true, disabledReason: "Nothing selected" },
      slots: { default: "Delete" },
    });
    expect(w.get("button").attributes("title")).toBe("Nothing selected");
    expect(w.get("button").attributes("disabled")).toBeDefined();
  });

  it("does not emit click when disabled", async () => {
    const w = mount(UiButton, {
      props: { disabled: true },
      slots: { default: "X" },
    });
    await w.get("button").trigger("click");
    expect(w.emitted("click")).toBeUndefined();
  });
});
