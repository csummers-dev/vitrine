import { readonly, ref } from "vue";
import { START_LOCATION, type Router } from "vue-router";
import { NavStack, type NavSnapshot } from "@/utils/navStack";

/**
 * In-app Back / Forward (Phase 6, 3.3). The router's own navigations are
 * recorded in a NavStack; each history entry carries the stack id in
 * history.state (`vNav`), so a browser back/forward, the header buttons and
 * Alt+←/→ all land on the right position, and a reload restores it from
 * sessionStorage. Back is disabled on the first page the app opened.
 */

const STORAGE_KEY = "vitrine:navStack";
const STATE_KEY = "vNav";

const canBack = ref(false);
const canForward = ref(false);
let stack = new NavStack();
let installed: Router | null = null;

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

function load(): NavSnapshot | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NavSnapshot) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.snapshot()));
  } catch {
    /* private mode or full: back/forward still work for this page */
  }
}

function tag(id: string) {
  try {
    window.history.replaceState(
      { ...(window.history.state ?? {}), [STATE_KEY]: id },
      ""
    );
  } catch {
    /* some embedded browsers refuse replaceState; nothing to do */
  }
}

function sync() {
  canBack.value = stack.canBack;
  canForward.value = stack.canForward;
  save();
}

/** Hooks the router once (main.ts). Safe to call again. */
export function installNavHistory(router: Router): void {
  if (installed === router) return;
  installed = router;
  stack = new NavStack(load());

  let popped = false;
  let replacing = false;
  window.addEventListener("popstate", () => {
    popped = true;
  });

  const replace = router.replace.bind(router);
  router.replace = (to) => {
    replacing = true;
    return replace(to);
  };
  const push = router.push.bind(router);
  router.push = (to) => {
    if (typeof to === "object" && to !== null && "replace" in to && to.replace)
      replacing = true;
    return push(to);
  };

  router.afterEach((to, from, failure) => {
    const wasPop = popped;
    const wasReplace = replacing;
    popped = false;
    replacing = false;
    if (failure) return;

    const existing = (window.history.state ?? {})[STATE_KEY] as
      | string
      | undefined;
    if (from === START_LOCATION) {
      // First page of this load: a reload lands on a tagged entry.
      if (!existing || !stack.moveTo(existing)) {
        const id = newId();
        stack.reset(id, to.fullPath);
        tag(id);
      }
    } else if (wasPop) {
      if (!existing || !stack.moveTo(existing)) {
        const id = newId();
        stack.reset(id, to.fullPath);
        tag(id);
      }
    } else {
      const id = newId();
      if (wasReplace) stack.replace(id, to.fullPath);
      else stack.push(id, to.fullPath);
      tag(id);
    }
    sync();
  });

  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target as HTMLElement | null;
    // Option+arrow moves by word in text on macOS: leave fields alone.
    if (
      t &&
      (t.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
    )
      return;
    if (e.key === "ArrowLeft" && stack.canBack) {
      e.preventDefault();
      router.back();
    } else if (e.key === "ArrowRight" && stack.canForward) {
      e.preventDefault();
      router.forward();
    }
  });
}

export function useNavHistory() {
  return {
    canBack: readonly(canBack),
    canForward: readonly(canForward),
    back: () => {
      if (installed && stack.canBack) installed.back();
    },
    forward: () => {
      if (installed && stack.canForward) installed.forward();
    },
  };
}

/** Tests only: forget all state. */
export function __resetNavHistory(): void {
  installed = null;
  stack = new NavStack();
  canBack.value = false;
  canForward.value = false;
}
