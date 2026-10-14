import { describe, it, expect } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import UiToggle from "../UiToggle.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";

describe("UiToggle", () => {
  it("is a switch that flips on click", async () => {
    const w = mount(UiToggle, {
      props: { modelValue: false, ariaLabel: "Dark mode" },
    });
    const b = w.get('[role="switch"]');
    expect(b.attributes("aria-checked")).toBe("false");
    expect(b.attributes("aria-label")).toBe("Dark mode");
    await b.trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([true]);
  });

  it("flips when its label is clicked, and is named by it", async () => {
    const w = mount(UiToggle, {
      props: { modelValue: true, label: "Enabled" },
    });
    const b = w.get('[role="switch"]');
    const label = w.get(".ui-toggle__label");
    expect(b.attributes("aria-labelledby")).toBe(label.attributes("id"));
    await label.trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("does nothing when disabled", async () => {
    const w = mount(UiToggle, {
      props: { modelValue: false, label: "x", disabled: true },
    });
    await w.get(".ui-toggle__label").trigger("click");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("takes its name and description from a surrounding settings row", async () => {
    const Host = defineComponent({
      setup() {
        const v = ref(false);
        return () =>
          h(
            SettingsRow,
            {
              label: "Hide dotfiles",
              description: "Skip names starting with a dot.",
            },
            () =>
              h(UiToggle, {
                modelValue: v.value,
                "onUpdate:modelValue": (x: boolean) => (v.value = x),
              })
          );
      },
    });
    const w = mount(Host, { attachTo: document.body });
    await w.vm.$nextTick();
    const sw = w.get('[role="switch"]');
    const label = w.get(".settings-row__title");
    expect(sw.attributes("aria-labelledby")).toBe(label.attributes("id"));
    expect(sw.attributes("aria-describedby")).toBe(
      w.get(".settings-row__description").attributes("id")
    );
    expect(label.attributes("for")).toBe(sw.attributes("id"));
    w.unmount();
  });
});
