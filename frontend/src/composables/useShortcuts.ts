import {
  computed,
  onBeforeUnmount,
  ref,
  type ComputedRef,
  type Ref,
} from "vue";
import { useLayoutStore } from "@/stores/layout";
import { useCommandPalette } from "@/composables/useCommandPalette";
import { useMobileNav } from "@/composables/useMobileNav";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";

/**
 * Global keyboard-shortcut registry + dispatcher.
 *
 * Components call `useShortcuts().register({...})` from their setup; the
 * registration is automatically removed when the calling component
 * unmounts (via `onBeforeUnmount`). The ShortcutsOverlay reads the live
 * registry to render its cheat-sheet, so adding a shortcut anywhere in
 * the app automatically documents it.
 *
 * The dispatcher is installed once globally (see installShortcuts() —
 * App.vue calls it on mount). It listens at the window level and:
 *   - skips when an input/textarea/contenteditable has focus,
 *   - skips when any blocking overlay is open (prompt, palette, drawer,
 *     slide-over), so single-key shortcuts can't fire under modals,
 *   - skips when modifier keys are pressed (Ctrl/Meta/Alt — Cmd+K and
 *     friends are handled by their own dedicated listeners),
 *   - supports two-key chord sequences (e.g. `g` then `f`) with a
 *     1500 ms window; pressing any non-chord key cancels the chord.
 *
 * Why singleton: shortcuts must be unique across the app and the cheat
 * sheet needs a single source of truth. A module-scoped Map fits better
 * than a Pinia store (pure UI state, no persistence).
 */

export type ShortcutGroup = "navigation" | "view" | "files" | "help";

export interface ShortcutDefinition {
  /** Stable id used to unregister. */
  id: string;
  /**
   * Keys to match. Either a single key (e.g. `"?"`, `"n"`, `"/"`) or a
   * two-element chord (e.g. `["g", "f"]`). Case-insensitive for letters.
   */
  keys: string | [string, string];
  /** Short label shown in the cheat sheet. */
  label: string;
  /** Section the shortcut appears under in the cheat sheet. */
  group: ShortcutGroup;
  /**
   * If true the shortcut is allowed to fire while an input is focused.
   * Default false. Use sparingly (e.g. for Esc-style global escapes).
   */
  allowInInput?: boolean;
  /** Handler. The event's `preventDefault` is already called by the dispatcher. */
  handler: (event: KeyboardEvent) => void;
}

const registry: Ref<Map<string, ShortcutDefinition>> = ref(new Map());

// Two-key chord buffer. When the user presses `g`, we store it here and
// wait for a follow-up key. If the follow-up key isn't part of any
// registered chord, or it doesn't arrive within the timeout, the buffer
// clears and life goes on.
let chordPrefix: string | null = null;
let chordTimer: ReturnType<typeof setTimeout> | null = null;

const CHORD_TIMEOUT_MS = 1500;

const clearChord = () => {
  chordPrefix = null;
  if (chordTimer !== null) {
    clearTimeout(chordTimer);
    chordTimer = null;
  }
};

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
};

/**
 * Returns true if some blocking overlay is open — in that case single-key
 * shortcuts shouldn't fire. We don't block on the mobile nav drawer for
 * `?` etc. since the user might want to dismiss it via keyboard, but we
 * do block on prompts, palette, and explicit slide-overs.
 */
const isOverlayBlocking = (): boolean => {
  try {
    return computeOverlayBlocking();
  } catch (err) {
    // This runs on EVERY keydown. If a store/composable access here ever
    // throws, an un-caught error would abort the dispatcher for that key —
    // and because it'd throw deterministically, it would silently disable
    // *every* shortcut. Fail open (treat as not-blocking) and log instead.
    console.error("[shortcuts] overlay-blocking check failed:", err);
    return false;
  }
};

const computeOverlayBlocking = (): boolean => {
  const layoutStore = useLayoutStore();
  const palette = useCommandPalette();
  const mobileNav = useMobileNav();
  const overlay = useShortcutsOverlay();
  if (layoutStore.currentPrompt !== null) return true;
  if (palette.isOpen.value) return true;
  if (mobileNav.isOpen.value) return true;
  if (overlay.isOpen.value) return true;
  // Editor / preview overlays — these set their own focus traps so the
  // dispatcher will already skip them via isTypingTarget for the Editor's
  // text area, but for Preview (no input) we explicitly bail out.
  const previewer = document.getElementById("previewer");
  if (previewer) return true;
  const editor = document.getElementById("editor-container");
  if (editor) return true;
  return false;
};

const normalize = (key: string) => key.toLowerCase();

/**
 * Find a shortcut definition whose single-key matches `key`.
 */
const findSingleKeyMatch = (key: string): ShortcutDefinition | null => {
  const k = normalize(key);
  for (const def of registry.value.values()) {
    if (typeof def.keys === "string" && normalize(def.keys) === k) {
      return def;
    }
  }
  return null;
};

/**
 * Find a chord definition whose first key matches `key`.
 */
const isChordPrefix = (key: string): boolean => {
  const k = normalize(key);
  for (const def of registry.value.values()) {
    if (Array.isArray(def.keys) && normalize(def.keys[0]) === k) return true;
  }
  return false;
};

/**
 * Find a chord definition matching prefix → key.
 */
const findChordMatch = (
  prefix: string,
  key: string
): ShortcutDefinition | null => {
  const p = normalize(prefix);
  const k = normalize(key);
  for (const def of registry.value.values()) {
    if (
      Array.isArray(def.keys) &&
      normalize(def.keys[0]) === p &&
      normalize(def.keys[1]) === k
    ) {
      return def;
    }
  }
  return null;
};

/** Invoke a shortcut handler, isolating any error so a single broken handler
 *  can't surface as an uncaught exception out of the global keydown listener. */
const runHandler = (def: ShortcutDefinition, event: KeyboardEvent) => {
  try {
    def.handler(event);
  } catch (err) {
    console.error(`[shortcuts] handler "${def.id}" failed:`, err);
  }
};

const dispatch = (event: KeyboardEvent) => {
  // Always allow modifier-driven combos to pass through; those have their
  // own dedicated handlers elsewhere (Ctrl+S, Cmd+K, etc.).
  if (event.metaKey || event.ctrlKey || event.altKey) {
    clearChord();
    return;
  }

  const typing = isTypingTarget(event.target);
  const blocked = isOverlayBlocking();

  // If we're in a chord-in-progress, try to complete it first.
  if (chordPrefix !== null) {
    const match = findChordMatch(chordPrefix, event.key);
    clearChord();
    if (match && !typing && !blocked) {
      event.preventDefault();
      runHandler(match, event);
      return;
    }
    // Fall through — the second key wasn't part of a chord; treat it as
    // a fresh single-key press.
  }

  // Single-key match?
  const single = findSingleKeyMatch(event.key);
  if (single) {
    if (typing && !single.allowInInput) return;
    if (blocked) return;
    event.preventDefault();
    runHandler(single, event);
    return;
  }

  // Maybe it's the start of a chord.
  if (!typing && !blocked && isChordPrefix(event.key)) {
    chordPrefix = event.key;
    chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
  }
};

let installed = false;

/**
 * Installs the global dispatcher exactly once. Safe to call from App.vue
 * on mount — subsequent calls are no-ops.
 */
export const installShortcuts = () => {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", dispatch);
};

/** Returns the live list of registered shortcuts, sorted by group. */
const shortcuts: ComputedRef<ShortcutDefinition[]> = computed(() =>
  [...registry.value.values()].sort((a, b) => {
    if (a.group !== b.group) {
      const order: ShortcutGroup[] = ["navigation", "view", "files", "help"];
      return order.indexOf(a.group) - order.indexOf(b.group);
    }
    return a.label.localeCompare(b.label);
  })
);

export function useShortcuts() {
  /**
   * Register a shortcut. Returns an unregister function. Automatically
   * unregisters on the calling component's unmount, so callers usually
   * don't need to capture the returned function.
   */
  const register = (def: ShortcutDefinition) => {
    registry.value.set(def.id, def);
    const unregister = () => {
      // Guard against re-registering a stale id during HMR.
      if (registry.value.get(def.id) === def) {
        registry.value.delete(def.id);
      }
    };
    // Best-effort cleanup. If called outside a setup() this is a no-op
    // and the caller is responsible for unregistering manually.
    try {
      onBeforeUnmount(unregister);
    } catch {
      /* called outside a component setup — ignore */
    }
    return unregister;
  };

  return {
    register,
    shortcuts,
  };
}
