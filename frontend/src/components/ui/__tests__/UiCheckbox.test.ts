import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiCheckbox from "../UiCheckbox.vue";
import UiRadio from "../UiRadio.vue";

describe("UiCheckbox", () => {
  it("emits the checked state", async () => {
    const w = mount(UiCheckbox, {
      props: { modelValue: false, label: "Hidden files" },
    });
    await w.get("input").setValue(true);
    expect(w.emitted("update:modelValue")?.[0]).toEqual([true]);
    expect(w.text()).toContain("Hidden files");
  });

  it("sets the native indeterminate state and aria-checked=mixed", async () => {
    const w = mount(UiCheckbox, {
      props: {
        modelValue: false,
        ariaLabel: "Select all",
        indeterminate: true,
      },
    });
    const input = w.get("input").element as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    expect(w.get("input").attributes("aria-checked")).toBe("mixed");
    await w.setProps({ indeterminate: false });
    expect(input.indeterminate).toBe(false);
  });

  it("can be disabled", () => {
    const w = mount(UiCheckbox, {
      props: { modelValue: true, label: "x", disabled: true },
    });
    expect(w.get("input").attributes("disabled")).toBeDefined();
  });
});

describe("UiRadio", () => {
  it("is checked for its value and emits it", async () => {
    const w = mount(UiRadio, {
      props: { modelValue: "a", value: "b", name: "g", label: "B" },
    });
    const input = w.get("input").element as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(input.name).toBe("g");
    await w.get("input").trigger("change");
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["b"]);
  });
});
