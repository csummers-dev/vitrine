import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import BaseModal from "@/components/prompts/BaseModal.vue";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

const content = () => [
  h("h2", "Delete 3 items?"),
  h("button", { id: "cancel" }, "Cancel"),
  h("button", { id: "focus-prompt" }, "Delete"),
];

describe("BaseModal (dialog)", () => {
  it("is a modal dialog named by its heading, with focus on the default button", async () => {
    const w = mount(BaseModal, {
      slots: { default: content },
      attachTo: document.body,
    });
    await flushPromises();
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const label = document.getElementById(
      dialog.getAttribute("aria-labelledby")!
    );
    expect(label?.textContent).toBe("Delete 3 items?");
    expect(document.activeElement?.id).toBe("focus-prompt");
    w.unmount();
  });

  it("locks page scroll while open and restores it", async () => {
    const w = mount(BaseModal, {
      slots: { default: content },
      attachTo: document.body,
    });
    await flushPromises();
    expect(document.body.style.overflow).toBe("hidden");
    w.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Escape unless busy", async () => {
    const w = mount(BaseModal, {
      slots: { default: content },
      attachTo: document.body,
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.emitted("closed")).toHaveLength(1);
    await w.setProps({ busy: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.emitted("closed")).toHaveLength(1);
    w.unmount();
  });

  it("returns focus to the opener when it closes", async () => {
    const Host = defineComponent({
      setup() {
        const open = ref(false);
        return { open };
      },
      render() {
        return h("div", [
          h(
            "button",
            { id: "opener", onClick: () => (this.open = true) },
            "Open"
          ),
          this.open
            ? h(
                BaseModal,
                { onClosed: () => (this.open = false) },
                { default: content }
              )
            : null,
        ]);
      },
    });
    const w = mount(Host, { attachTo: document.body });
    const opener = document.getElementById("opener") as HTMLButtonElement;
    opener.focus();
    opener.click();
    await flushPromises();
    await nextTick();
    expect(document.activeElement?.id).toBe("focus-prompt");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    await nextTick();
    expect(document.activeElement?.id).toBe("opener");
    w.unmount();
  });
});
