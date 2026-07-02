import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import { useBrandLogo } from "@/composables/useBrandLogo";

// The observer watches <html>'s class attribute; MutationObserver callbacks
// are microtasks, so flush with nextTick-ish awaits after each class change.
const flushObserver = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  document.documentElement.classList.remove("dark");
  await flushObserver();
  await nextTick();
});

describe("useBrandLogo", () => {
  it("serves the light mark on the light theme", () => {
    const { logoURL, isDark } = useBrandLogo();
    expect(isDark.value).toBe(false);
    expect(logoURL.value).toContain("/img/logo-light.png");
  });

  it("flips to the dark mark when html gains the dark class (theme toggle)", async () => {
    const { logoURL } = useBrandLogo();
    document.documentElement.classList.add("dark");
    await flushObserver();
    await nextTick();
    expect(logoURL.value).toContain("/img/logo-dark.png");

    document.documentElement.classList.remove("dark");
    await flushObserver();
    await nextTick();
    expect(logoURL.value).toContain("/img/logo-light.png");
  });

  it("tracks utils/theme.ts's className-assignment style too", async () => {
    const { isDark } = useBrandLogo();
    // setTheme() assigns html.className wholesale rather than toggling.
    document.documentElement.className = "dark";
    await flushObserver();
    await nextTick();
    expect(isDark.value).toBe(true);
    document.documentElement.className = "";
    await flushObserver();
    await nextTick();
    expect(isDark.value).toBe(false);
  });
});
