/**
 * Live "Copy" / "Move" badge that trails the cursor during an HTML5
 * file/folder drag, so the user can see — and change, by holding ⌘/Ctrl —
 * whether dropping will copy or move, *before* they let go.
 *
 * Why a separate element instead of baking it into the drag image: the drag
 * image (utils/dragGhost) is a STATIC bitmap `setDragImage()` rasterizes at
 * dragstart — it can't reflect the modifier changing mid-drag. This is a
 * lightweight, pointer-events:none DOM pill we reposition ourselves on each
 * `dragover`, and re-label on ⌘/Ctrl keydown/keyup so it stays correct even
 * while the pointer is still. It sits just below the drag image.
 *
 * Singleton (one drag at a time). `start` on dragstart, `move` on dragover,
 * `end` on dragend/drop. `move`/`end` are no-ops when no badge is active, so
 * callers don't need to know whether a drag is a file drag.
 */

const OFFSET_X = 16;
const OFFSET_Y = 30; // sit just below the drag image (anchored at cursor+10)

let badge: HTMLElement | null = null;
let lastX = 0;
let lastY = 0;
let lastCopy = false;
// Colors are resolved once per drag (theme can't change mid-drag).
let copyBg = "";
let copyFg = "";
let moveBg = "";
let moveFg = "";

function rootVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function render(): void {
  if (!badge) return;
  badge.textContent = lastCopy ? "Copy" : "Move";
  badge.style.background = lastCopy ? copyBg : moveBg;
  badge.style.color = lastCopy ? copyFg : moveFg;
  // translate() (vs left/top) keeps the reposition on the compositor.
  badge.style.transform = `translate(${lastX + OFFSET_X}px, ${lastY + OFFSET_Y}px)`;
}

// Reflect the ⌘/Ctrl held state immediately, even if the pointer is stationary
// (there's no "drag modifier changed" event, so we listen on the keyboard).
function onKey(e: KeyboardEvent): void {
  // Escape cancels the drag. Browsers don't reliably fire `dragend` on an
  // Esc-cancel (and the source row can unmount mid-drag), which would leave
  // this badge stranded on screen. This listener is window-capture and stays
  // live for the whole drag — so it sees the Escape even while the native drag
  // owns the pointer — so tear the badge down here directly.
  if (e.key === "Escape") {
    endDragBadge();
    return;
  }
  const copy = e.ctrlKey || e.metaKey;
  if (copy !== lastCopy) {
    lastCopy = copy;
    render();
  }
}

export function startDragBadge(copy: boolean, x: number, y: number): void {
  if (badge) endDragBadge();
  lastCopy = copy;
  lastX = x;
  lastY = y;
  // Move = high-contrast neutral pill (inverts cleanly per theme).
  // Copy = green, the conventional "add a copy" affordance.
  moveBg = rootVar("--color-ink-1", "#18181b");
  moveFg = rootVar("--color-surface", "#ffffff");
  copyBg = rootVar("--color-positive", "#16a34a");
  copyFg = "#ffffff";

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    left: "0",
    top: "0",
    padding: "2px 9px",
    borderRadius: "999px",
    font: "600 11px/1.4 system-ui, -apple-system, sans-serif",
    letterSpacing: "0.02em",
    boxShadow: "0 4px 14px -4px rgba(0,0,0,0.4)",
    pointerEvents: "none",
    zIndex: "10001",
    willChange: "transform",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  badge = el;
  render();

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
}

export function moveDragBadge(copy: boolean, x: number, y: number): void {
  if (!badge) return;
  lastCopy = copy;
  lastX = x;
  lastY = y;
  render();
}

export function endDragBadge(): void {
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("keyup", onKey, true);
  if (badge) {
    badge.remove();
    badge = null;
  }
}
