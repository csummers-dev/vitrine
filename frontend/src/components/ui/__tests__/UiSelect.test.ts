import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiSelect from "../UiSelect.vue";

const options = [
  { value: 0, label: "Any" },
  { value: 1024, label: "1 KB" },
  { value: 2048, label: "2 KB", disabled: true },
];

describe("UiSelect", () => {
  it("is a native select with the current value selected", () => {
    const w = mount(UiSelect, {
      props: { modelValue: 1024, options, label: "Size" },
    });
    const sel = w.get("select").element as HTMLSelectElement;
    expect(sel.value).toBe("1024");
    expect(w.findAll("option")[2].attributes("disabled")).toBeDefined();
  });

  it("emits the option's own value (numbers stay numbers)", async () => {
    const w = mount(UiSelect, {
      props: { modelValue: 0, options, label: "Size" },
    });
    await w.get("select").setValue("1024");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([1024]);
  });

  it("shows and links an error", () => {
    const w = mount(UiSelect, {
      props: {
        modelValue: 0,
        options,
        label: "Size",
        error: "Pick one",
        id: "s",
      },
    });
    expect(w.get("select").attributes("aria-describedby")).toBe("s-error");
    expect(w.get("select").attributes("aria-invalid")).toBe("true");
  });
});
