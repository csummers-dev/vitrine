import { describe, it, expect, beforeEach } from "vitest";
import { createRouter, createWebHistory } from "vue-router";
import { defineComponent } from "vue";
import {
  installNavHistory,
  useNavHistory,
  __resetNavHistory,
} from "@/composables/useNavHistory";

const Page = defineComponent({ render: () => null });

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: "/:p(.*)*", component: Page }],
  });
}

const popped = () =>
  new Promise<void>((r) =>
    window.addEventListener("popstate", () => setTimeout(r, 0), { once: true })
  );

beforeEach(() => {
  __resetNavHistory();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/start");
});

describe("useNavHistory", () => {
  it("enables back after a push and forward after going back", async () => {
    const router = makeRouter();
    installNavHistory(router);
    await router.push("/files/");
    await router.isReady();
    const nav = useNavHistory();
    expect(nav.canBack.value).toBe(false);

    await router.push("/files/Music/");
    expect(nav.canBack.value).toBe(true);
    expect(nav.canForward.value).toBe(false);

    const p = popped();
    nav.back();
    await p;
    await router.isReady();
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe("/files/");
    expect(nav.canBack.value).toBe(false);
    expect(nav.canForward.value).toBe(true);
  });

  it("replace does not add an entry", async () => {
    const router = makeRouter();
    installNavHistory(router);
    await router.push("/a");
    await router.push("/b");
    await router.replace("/c");
    const nav = useNavHistory();
    expect(nav.canBack.value).toBe(true);
    const saved = JSON.parse(sessionStorage.getItem("vitrine:navStack")!);
    expect(saved.entries.map((e: { path: string }) => e.path)).toEqual([
      "/a",
      "/c",
    ]);
  });

  it("restores the position after a reload", async () => {
    const r1 = makeRouter();
    installNavHistory(r1);
    await r1.push("/a");
    await r1.push("/b");
    // A reload: new router, same tab state and sessionStorage.
    __resetNavHistory();
    const r2 = makeRouter();
    installNavHistory(r2);
    await r2.push(window.location.pathname);
    await r2.isReady();
    expect(useNavHistory().canBack.value).toBe(true);
  });
});
