/**
 * useQuickPeek — singleton state for the Space-bar quick preview overlay
 * (macOS Quick Look style).
 *
 * The peek doesn't hold its own item: it holds a GETTER for "the single
 * selected item of the pane that opened it". Arrow keys keep moving the
 * listing selection underneath (the overlay deliberately lets them through),
 * and the peek re-renders reactively for whatever is selected now. When the
 * getter stops yielding an item (selection cleared, multi-select, navigated
 * away) the overlay auto-closes.
 *
 * Singleton (module-level state) so pane A, pane B, and the one rendered
 * <QuickPeek/> instance share the same open state.
 */
import { computed, ref } from "vue";

export type PeekGetter = () => ResourceItem | null;

const active = ref(false);
const getter = ref<PeekGetter | null>(null);

const item = computed<ResourceItem | null>(() =>
  active.value && getter.value ? getter.value() : null
);

function open(g: PeekGetter): void {
  getter.value = g;
  active.value = true;
}

function close(): void {
  active.value = false;
  getter.value = null;
}

/** Space toggles: open when closed, close when open (whichever pane asks). */
function toggle(g: PeekGetter): void {
  if (active.value) close();
  else open(g);
}

export function useQuickPeek() {
  return { active, item, open, close, toggle };
}

/** Test helper: reset module-level state between tests. */
export function __resetQuickPeekForTests(): void {
  close();
}
