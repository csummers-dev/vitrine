import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiTextField from "../UiTextField.vue";

describe("UiTextField", () => {
  it("links the label, hint and error to the input", () => {
    const w = mount(UiTextField, {
      props: {
        modelValue: "",
        label: "Name",
        hint: "Shown to others",
        error: "Required",
        id: "nm",
      },
    });
    const input = w.get("input");
    expect(w.get("label").attributes("for")).toBe("nm");
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-describedby")).toBe("nm-error nm-hint");
    expect(w.get("#nm-error").text()).toBe("Required");
    expect(w.get("#nm-hint").text()).toBe("Shown to others");
  });

  it("emits typed values", async () => {
    const w = mount(UiTextField, { props: { modelValue: "", label: "Name" } });
    await w.get("input").setValue("abc");
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["abc"]);
  });

  it("uses aria-label when there is no visible label", () => {
    const w = mount(UiTextField, {
      props: { modelValue: "", ariaLabel: "Search" },
    });
    expect(w.get("input").attributes("aria-label")).toBe("Search");
  });

  it("clears with the button and with Escape", async () => {
    const w = mount(UiTextField, {
      props: { modelValue: "x", ariaLabel: "Search", clearable: true },
    });
    await w.get("button").trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([""]);
    expect(w.emitted("clear")).toHaveLength(1);
    await w.get("input").trigger("keydown", { key: "Escape" });
    expect(w.emitted("update:modelValue")).toHaveLength(2);
  });

  it("has no clear button when empty or disabled", async () => {
    const w = mount(UiTextField, {
      props: { modelValue: "", ariaLabel: "S", clearable: true },
    });
    expect(w.find("button").exists()).toBe(false);
    await w.setProps({ modelValue: "x", disabled: true });
    expect(w.find("button").exists()).toBe(false);
  });
});
