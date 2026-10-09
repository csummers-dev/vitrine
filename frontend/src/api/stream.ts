/**
 * Server-pushed events (4.0 Phase 1.3 groundwork for Phase 2's live
 * listings). One `EventSource` per tab, shared by every subscriber, opened on
 * the first subscription and closed after the last one leaves.
 *
 * - Reconnects with exponential backoff (1 s doubling to 30 s, with jitter)
 *   after the connection drops; a successful open resets the backoff.
 * - Pauses while the tab is hidden: after a short grace period the connection
 *   is closed, and it reopens as soon as the tab is visible again.
 * - Authenticates with the `auth` cookie the login flow sets, because
 *   EventSource cannot send an X-Auth header.
 *
 * Event payloads are JSON in the `data:` field, and the SSE `event:` name is
 * the key of ServerEventMap.
 */
import { baseURL } from "@/utils/constants";

/** Every event the server can push, by SSE event name. */
export interface ServerEventMap {
  /** Files changed in a folder (by vitrine or by anything else). */
  "files.changed": { dir: string; names: string[] };
  /** A background transfer job made progress or settled. */
  "job.progress": { id: string; status: string; filesDone: number };
  /** A public share link was opened or downloaded. */
  "share.accessed": { hash: string; views: number; downloads: number };
}

export type ServerEventType = keyof ServerEventMap;
export type ServerEventHandler<K extends ServerEventType> = (
  payload: ServerEventMap[K]
) => void;

/** The parts of EventSource the client uses; replaceable in tests. */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
}

export interface StreamOptions {
  url?: string;
  createSource?: (url: string) => EventSourceLike;
  /** Delay before the first reconnect; doubles up to maxDelayMs. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** How long a hidden tab keeps the connection before closing it. */
  hiddenGraceMs?: number;
  random?: () => number;
  doc?: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
}

const EVENT_TYPES: ServerEventType[] = [
  "files.changed",
  "job.progress",
  "share.accessed",
];

const CLOSED = 2;

export class EventStream {
  private readonly opts: Required<StreamOptions>;
  private source: EventSourceLike | null = null;
  private handlers = new Map<
    ServerEventType,
    Set<(payload: unknown) => void>
  >();
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

  constructor(opts: StreamOptions = {}) {
    this.opts = {
      url: opts.url ?? `${baseURL}/api/events/stream`,
      createSource:
        opts.createSource ??
        ((u) => new EventSource(u, { withCredentials: true })),
      baseDelayMs: opts.baseDelayMs ?? 1000,
      maxDelayMs: opts.maxDelayMs ?? 30_000,
      hiddenGraceMs: opts.hiddenGraceMs ?? 30_000,
      random: opts.random ?? Math.random,
      doc: opts.doc ?? document,
    };
  }

  /** True while an EventSource is open or connecting. */
  get connected(): boolean {
    return this.source !== null;
  }

  /** Subscribe to one event type. Returns the unsubscribe function. */
  on<K extends ServerEventType>(
    type: K,
    handler: ServerEventHandler<K>
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const h = handler as (payload: unknown) => void;
    set.add(h);
    this.start();
    return () => {
      set!.delete(h);
      if (this.subscriberCount() === 0) this.stop();
    };
  }

  private subscriberCount(): number {
    let n = 0;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }

  private start(): void {
    if (!this.listening) {
      this.opts.doc.addEventListener("visibilitychange", this.onVisibility);
      this.listening = true;
    }
    if (this.opts.doc.visibilityState === "hidden") return;
    if (!this.source && this.retryTimer === null) this.connect();
  }

  private stop(): void {
    this.clearTimers();
    this.disconnect();
    if (this.listening) {
      this.opts.doc.removeEventListener("visibilitychange", this.onVisibility);
      this.listening = false;
    }
    this.attempt = 0;
  }

  private connect(): void {
    const src = this.opts.createSource(this.opts.url);
    this.source = src;
    src.onopen = () => {
      this.attempt = 0;
    };
    src.onerror = () => {
      // The browser retries a dropped stream by itself, but gives up for
      // good on HTTP errors (readyState CLOSED). Own the retry in that case.
      if (src.readyState === CLOSED) {
        this.disconnect();
        this.scheduleRetry();
      }
    };
    for (const type of EVENT_TYPES) {
      src.addEventListener(type, (ev) => this.dispatch(type, ev.data));
    }
  }

  private disconnect(): void {
    if (this.source) {
      this.source.onopen = null;
      this.source.onerror = null;
      this.source.close();
      this.source = null;
    }
  }

  private dispatch(type: ServerEventType, data: unknown): void {
    let payload: unknown;
    try {
      payload = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return; // malformed payload: drop it rather than break subscribers
    }
    for (const h of this.handlers.get(type) ?? []) {
      try {
        h(payload);
      } catch (e) {
        console.error(`[stream] ${type} handler failed`, e);
      }
    }
  }

  /** Next reconnect delay: exponential, capped, with ±20% jitter. */
  nextDelay(): number {
    const exp = Math.min(
      this.opts.maxDelayMs,
      this.opts.baseDelayMs * 2 ** this.attempt
    );
    const jitter = 0.8 + this.opts.random() * 0.4;
    return Math.round(exp * jitter);
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    const delay = this.nextDelay();
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (
        this.subscriberCount() > 0 &&
        !this.source &&
        this.opts.doc.visibilityState !== "hidden"
      )
        this.connect();
    }, delay);
  }

  private clearTimers(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.hiddenTimer !== null) clearTimeout(this.hiddenTimer);
    this.retryTimer = null;
    this.hiddenTimer = null;
  }

  private onVisibility = (): void => {
    if (this.opts.doc.visibilityState === "hidden") {
      if (this.hiddenTimer === null && this.source) {
        this.hiddenTimer = setTimeout(() => {
          this.hiddenTimer = null;
          this.disconnect();
        }, this.opts.hiddenGraceMs);
      }
      return;
    }
    if (this.hiddenTimer !== null) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
    if (this.subscriberCount() > 0 && !this.source) {
      if (this.retryTimer !== null) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.attempt = 0;
      this.connect();
    }
  };
}

let shared: EventStream | null = null;

/** The tab-wide stream every useServerEvents subscriber shares. */
export function eventStream(): EventStream {
  if (!shared) shared = new EventStream();
  return shared;
}
