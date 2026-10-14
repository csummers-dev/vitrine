/**
 * The app's own record of where it has been (Phase 6, 3.3), so the header's
 * Back and Forward buttons know whether there is anywhere to go. A browser
 * page can't see its own history list, so each entry the app creates gets an
 * id (kept in history.state) and this stack maps ids to positions.
 */
export interface NavEntry {
  id: string;
  path: string;
}

export interface NavSnapshot {
  entries: NavEntry[];
  index: number;
}

/** Most entries kept; older ones fall off the bottom. */
export const NAV_STACK_MAX = 200;

export class NavStack {
  entries: NavEntry[] = [];
  index = -1;

  constructor(snapshot?: NavSnapshot | null) {
    if (
      snapshot &&
      Array.isArray(snapshot.entries) &&
      snapshot.index >= -1 &&
      snapshot.index < snapshot.entries.length
    ) {
      this.entries = snapshot.entries.slice(-NAV_STACK_MAX);
      this.index = Math.min(snapshot.index, this.entries.length - 1);
    }
  }

  get current(): NavEntry | undefined {
    return this.entries[this.index];
  }

  get canBack(): boolean {
    return this.index > 0;
  }

  get canForward(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  /** A new page: drops anything forward of here, like a browser does. */
  push(id: string, path: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ id, path });
    if (this.entries.length > NAV_STACK_MAX) this.entries.shift();
    this.index = this.entries.length - 1;
  }

  /** The current page swapped for another (no new entry). */
  replace(id: string, path: string): void {
    if (this.index < 0) return this.push(id, path);
    this.entries[this.index] = { id, path };
  }

  /**
   * Back or forward landed on the entry with this id. Returns false when the
   * id is unknown (a page from before this stack, or an entry that fell
   * off); the caller then starts a fresh stack from here.
   */
  moveTo(id: string): boolean {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.index = i;
    return true;
  }

  /** Begin again with just this page (reload with no saved state). */
  reset(id: string, path: string): void {
    this.entries = [{ id, path }];
    this.index = 0;
  }

  snapshot(): NavSnapshot {
    return { entries: this.entries.slice(), index: this.index };
  }
}
