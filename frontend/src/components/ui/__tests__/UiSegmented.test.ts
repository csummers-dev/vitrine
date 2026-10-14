import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiSegmented from "../UiSegmented.vue";

const options = [
  { value: "list", label: "List" },
  { value: "icons", label: "Icons" },
  { value: "gallery", label: "Gallery" },
];

describe("UiSegmented", () => {
  it("is a radio group with one tab stop", () => {
    const w = mount(UiSegmented, {
      props: { modelValue: "icons", options, ariaLabel: "View" },
    });
    expect(w.get('[role="radiogroup"]').attributes("aria-label")).toBe("View");
    const radios = w.findAll('[role="radio"]');
    expect(radios.map((r) => r.attributes("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(radios.map((r) => r.attributes("tabindex"))).toEqual([
      "-1",
      "0",
      "-1",
    ]);
  });

  it("selects on click", async () => {
    const w = mount(UiSegmented, { props: { modelValue: "list", options } });
    await w.findAll("button")[2].trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["gallery"]);
  });

  it("moves with the arrow keys, wrapping, and Home/End", async () => {
    const w = mount(UiSegmented, { props: { modelValue: "list", options } });
    const g = w.get('[role="radiogroup"]');
    await g.trigger("keydown", { key: "ArrowRight" });
    await g.trigger("keydown", { key: "ArrowLeft" });
    await g.trigger("keydown", { key: "End" });
    await g.trigger("keydown", { key: "Home" });
    expect(w.emitted("update:modelValue")?.map((e) => e[0])).toEqual([
      "icons",
      "gallery",
      "gallery",
    ]);
  });

  it("names icon-only options", () => {
    const w = mount(UiSegmented, {
      props: { modelValue: "list", options, iconOnly: true },
    });
    expect(w.findAll("button")[1].attributes("aria-label")).toBe("Icons");
  });
});
