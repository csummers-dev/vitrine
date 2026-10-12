/**
 * An in-memory stand-in for the vitrine Go API, installed with Playwright
 * request interception. It lets the UI smoke suite run against `vite dev`
 * with no backend, so frontend refactors (Phase 1) are covered anywhere —
 * locally and in CI — in seconds.
 *
 * It implements just enough of the API the listing, preview and trash flows
 * use. Anything it does not know is recorded in `unhandled` and answered with
 * 404, so a test can assert the UI stayed healthy without it.
 */
import type { Page, Route, Request } from "@playwright/test";

export interface FakeEntry {
  isDir: boolean;
  content?: string;
  modified: string;
}

export interface ApiCall {
  method: string;
  path: string;
  query: Record<string, string>;
}

const USER = {
  id: 1,
  username: "admin",
  password: "",
  scope: ".",
  locale: "en",
  lockPassword: false,
  viewMode: "list",
  singleClick: false,
  redirectAfterCopyMove: true,
  perm: {
    admin: true,
    execute: true,
    create: true,
    rename: true,
    modify: true,
    delete: true,
    share: true,
    download: true,
    copy: true,
    move: true,
    shell: false,
    upload: true,
  },
  commands: [],
  sorting: { by: "name", asc: true },
  rules: [],
  hideDotfiles: false,
  dateFormat: false,
  preferences: {} as Record<string, unknown>,
};

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** An unsigned JWT the frontend can decode (it never verifies signatures). */
export function makeToken(preferences: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    user: { ...USER, preferences },
    iat: now,
    exp: now + 2 * 60 * 60,
  };
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;
}

const TYPES: Record<string, string> = {
  ".txt": "text",
  ".md": "text",
  ".jpg": "image",
  ".png": "image",
  ".mp3": "audio",
  ".mp4": "video",
  ".pdf": "pdf",
};

/** A 1×1 transparent PNG for thumbnail and preview requests. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i).toLowerCase() : "";
}

function norm(p: string): string {
  const parts = decodeURIComponent(p).split("/").filter(Boolean);
  return "/" + parts.join("/");
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

function baseName(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

export class FakeServer {
  readonly fs = new Map<string, FakeEntry>();
  readonly calls: ApiCall[] = [];
  readonly unhandled: string[] = [];
  readonly jobs: { id: string; [k: string]: unknown }[] = [];
  readonly streamQueue: { event: string; data: unknown }[] = [];

  /** Simulates a change made outside vitrine: updates the fake disk and
   *  pushes `files.changed` to open streams. `content` null removes. */
  /** Binary file bodies (served by /api/raw), keyed by path. */
  readonly binary = new Map<string, Buffer>();

  /** Add a binary file (e.g. a real JPEG) without a live-update event. */
  putBinary(path: string, bytes: Buffer): void {
    const p = norm(path);
    this.ensureParents(p);
    this.binary.set(p, bytes);
    this.fs.set(p, {
      isDir: false,
      content: "x".repeat(bytes.length),
      modified: new Date().toISOString(),
    });
  }

  /** Create any missing ancestor folders of `p`. */
  private ensureParents(p: string): void {
    for (
      let dir = parentOf(p);
      dir !== "/" && !this.fs.has(dir);
      dir = parentOf(dir)
    )
      this.fs.set(dir, { isDir: true, modified: new Date().toISOString() });
  }

  changeOnDisk(path: string, content: string | null): void {
    const p = norm(path);
    if (content !== null) this.ensureParents(p);
    if (content === null) this.fs.delete(p);
    else
      this.fs.set(p, {
        isDir: false,
        content,
        modified: new Date().toISOString(),
      });
    this.streamQueue.push({
      event: "files.changed",
      data: { dir: parentOf(p), names: [baseName(p)] },
    });
  }
  readonly trash: {
    id: string;
    path: string;
    subtree: [string, FakeEntry][];
  }[] = [];

  /** Share links (4.2 usage counts and download limits included). */
  readonly shares: {
    hash: string;
    path: string;
    expire: number;
    userID: number;
    views: number;
    downloads: number;
    lastAccessAt?: number;
    maxDownloads?: number;
    mode?: string;
    perUploaderFolder?: boolean;
    uploads?: number;
  }[] = [];

  /** Webhook endpoints (secrets kept here, never returned). */
  readonly webhooks: Record<string, unknown>[] = [];

  /** The duplicate scan in progress (4.0 5.2). */
  dupeScan: {
    opts: { path?: string; minSize?: number; [k: string]: unknown };
    polls: number;
  } | null = null;

  /** Two-factor state for the signed-in user. */
  readonly twoFactor = { enabled: false };

  /** The user's preferences: served in the token, updated by PUT /users. */
  preferences: Record<string, unknown> = {};

  constructor(files: Record<string, string | null>) {
    const when = "2026-10-01T12:00:00Z";
    this.fs.set("/", { isDir: true, modified: when });
    for (const [path, content] of Object.entries(files)) {
      const p = norm(path);
      // Create every ancestor folder.
      let dir = parentOf(p);
      while (dir !== "/" && !this.fs.has(dir)) {
        this.fs.set(dir, { isDir: true, modified: when });
        dir = parentOf(dir);
      }
      this.fs.set(
        p,
        content === null
          ? { isDir: true, modified: when }
          : { isDir: false, content, modified: when }
      );
    }
  }

  exists(path: string): boolean {
    return this.fs.has(norm(path));
  }

  children(dir: string): string[] {
    const d = norm(dir);
    return [...this.fs.keys()].filter((p) => p !== "/" && parentOf(p) === d);
  }

  private item(path: string) {
    const e = this.fs.get(path)!;
    const name = path === "/" ? "" : baseName(path);
    const ext = e.isDir ? "" : extOf(name);
    return {
      path,
      name,
      size: e.isDir ? 4096 : (e.content ?? "").length,
      extension: ext,
      modified: e.modified,
      mode: e.isDir ? 2147484141 : 420,
      isDir: e.isDir,
      isSymlink: false,
      type: e.isDir ? "dir" : (TYPES[ext] ?? "blob"),
    };
  }

  private listing(path: string) {
    const items = this.children(path).map((p) => this.item(p));
    return {
      ...this.item(path),
      items,
      numDirs: items.filter((i) => i.isDir).length,
      numFiles: items.filter((i) => !i.isDir).length,
      sorting: { by: "name", asc: true },
    };
  }

  private move(from: string, to: string, copy: boolean) {
    const moved = [...this.fs.entries()].filter(
      ([p]) => p === from || p.startsWith(from + "/")
    );
    for (const [p, e] of moved) {
      const dest = to + p.slice(from.length);
      this.fs.set(dest, { ...e });
      if (!copy) this.fs.delete(p);
    }
  }

  async install(page: Page): Promise<void> {
    // Only the API: vite dev also serves source modules under /src/api/.
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      (route) => this.handle(route)
    );
  }

  private async handle(route: Route): Promise<void> {
    const req: Request = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const query = Object.fromEntries(url.searchParams.entries());
    const api = url.pathname.slice("/api".length);
    this.calls.push({ method, path: api, query });

    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const text = (body: string, status = 200) =>
      route.fulfill({ status, contentType: "text/plain", body });

    // Two-factor sign-in (4.4). The fake's valid code is always 123456.
    if (api === "/login" && this.twoFactor.enabled)
      return json({ twoFactor: true, challenge: "c1" }, 202);
    if (api === "/login/2fa") {
      const b = JSON.parse(req.postData() || "{}");
      return b.challenge === "c1" && b.code === "123456"
        ? text(makeToken(this.preferences))
        : text("403 Forbidden", 403);
    }
    if (api === "/2fa" && method === "GET")
      return json({
        available: true,
        enabled: this.twoFactor.enabled,
        recoveryCodesLeft: this.twoFactor.enabled ? 10 : 0,
      });
    if (api === "/2fa/setup")
      return json({
        secret: "JBSWY3DPEHPK3PXP",
        uri: "otpauth://totp/vitrine:admin?secret=JBSWY3DPEHPK3PXP&issuer=vitrine",
      });
    if (api === "/2fa/enable") {
      const b = JSON.parse(req.postData() || "{}");
      if (b.code !== "123456") return text("400 Bad Request", 400);
      this.twoFactor.enabled = true;
      return json({
        recoveryCodes: Array.from({ length: 10 }, (_, i) => `ABCDE-FGH${i}J`),
      });
    }
    if (api === "/2fa/disable") {
      this.twoFactor.enabled = false;
      return text("", 200);
    }
    if (api === "/login" || api === "/renew")
      return text(makeToken(this.preferences));

    if (api.startsWith("/resources/recursive")) return json([]);

    if (api.startsWith("/resources")) {
      const raw = api.slice("/resources".length) || "/";
      const p = norm(raw);
      switch (method) {
        case "GET": {
          const e = this.fs.get(p);
          if (!e) return text("404 Not Found", 404);
          if (e.isDir) return json(this.listing(p));
          return json({ ...this.item(p), content: e.content ?? "" });
        }
        case "POST": {
          if (this.fs.has(p) && query.override !== "true")
            return text("409 Conflict", 409);
          const isDir = raw.endsWith("/");
          this.fs.set(p, {
            isDir,
            content: isDir ? undefined : (req.postData() ?? ""),
            modified: new Date().toISOString(),
          });
          return text("", 200);
        }
        case "PATCH": {
          const dest = norm(query.destination ?? "");
          if (!this.fs.has(p)) return text("404 Not Found", 404);
          if (this.fs.has(dest) && query.override !== "true")
            return text("409 Conflict", 409);
          this.move(p, dest, query.action === "copy");
          return text("", 200);
        }
        case "DELETE": {
          const e = this.fs.get(p);
          if (!e) return text("404 Not Found", 404);
          const subtree = [...this.fs.entries()].filter(
            ([k]) => k === p || k.startsWith(p + "/")
          );
          for (const [k] of subtree) this.fs.delete(k);
          if (query.permanent === "true") return text("", 200);
          const id = `t${this.trash.length + 1}`;
          this.trash.push({ id, path: p, subtree });
          // vitrine's soft delete answers with the new trash entry's id.
          return json({ trashId: id });
        }
        case "PUT": {
          const e = this.fs.get(p);
          if (!e) return text("404 Not Found", 404);
          e.content = req.postData() ?? "";
          return text("", 200);
        }
      }
    }

    // Minimal tus (resumable upload) server: create, then PATCH the bytes.
    if (api.startsWith("/tus/")) {
      const p = norm(api.slice("/tus".length));
      const tusHeaders = { "Tus-Resumable": "1.0.0" };
      if (method === "POST") {
        if (this.fs.has(p) && query.override !== "true")
          return text("409 Conflict", 409);
        this.fs.set(p, {
          isDir: false,
          content: "",
          modified: new Date().toISOString(),
        });
        return route.fulfill({
          status: 201,
          headers: { ...tusHeaders, Location: req.url() },
        });
      }
      const e = this.fs.get(p);
      if (!e) return text("404 Not Found", 404);
      if (method === "PATCH") {
        e.content =
          (e.content ?? "") + (req.postDataBuffer()?.toString() ?? "");
        return route.fulfill({
          status: 204,
          headers: {
            ...tusHeaders,
            "Upload-Offset": String((e.content ?? "").length),
          },
        });
      }
      if (method === "HEAD")
        return route.fulfill({
          status: 200,
          headers: {
            ...tusHeaders,
            "Upload-Offset": String((e.content ?? "").length),
          },
        });
    }
    // Server-sent events. Playwright can't hold a response open, so each
    // request returns the queued messages and asks EventSource to reconnect
    // shortly (`retry:`), which makes the stream behave like quick polling.
    if (api === "/events/stream") {
      const body =
        "retry: 150\n\n" +
        this.streamQueue
          .map((m) => `event: ${m.event}\ndata: ${JSON.stringify(m.data)}\n\n`)
          .join("");
      this.streamQueue.length = 0;
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
      });
    }
    // Audio tags: the fake files carry none.
    if (api === "/audio-tags/read" && method === "POST")
      return json({ results: [] });
    // Raw file bytes (media elements, downloads).
    if (api.startsWith("/raw/") && method === "GET") {
      const rp = norm(api.slice("/raw".length));
      const e = this.fs.get(rp);
      if (!e || e.isDir) return text("404 Not Found", 404);
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: this.binary.get(rp) ?? e.content ?? "",
      });
    }
    // Photo-map tiles.
    if (/^\/tiles\/\d+\/\d+\/\d+$/.test(api)) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PIXEL,
      });
    }
    if (api.startsWith("/preview/")) {
      // Folders (4.0 3.2): a cover only when one of the cover files exists.
      const target = norm(api.replace(/^\/preview\/[^/]+/, ""));
      if (this.fs.get(target)?.isDir) {
        const has = ["poster", "folder", "cover", "fanart"].some((n) =>
          this.fs.has(`${target === "/" ? "" : target}/${n}.jpg`)
        );
        if (!has) return text("404 Not Found", 404);
      }
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PIXEL,
      });
    }
    if (api.startsWith("/folder-size")) return json({ size: 0, count: 0 });
    // Duplicate finder (4.0 5.2): groups files by content. A new scan
    // reports "running" once, so the client's polling is exercised.
    if (api === "/dupes/scan") {
      if (method === "DELETE") {
        this.dupeScan = null;
        return text("", 204);
      }
      if (method === "POST") {
        const opts = JSON.parse(req.postData() ?? "{}");
        this.dupeScan = { opts, polls: 0 };
      }
      if (!this.dupeScan) return text("404 Not Found", 404);
      const { opts } = this.dupeScan;
      const done = method === "GET" && this.dupeScan.polls++ > 0;
      const root = norm(opts.path || "/");
      const byContent = new Map<string, string[]>();
      for (const [p, e] of this.fs) {
        if (e.isDir || !(root === "/" || p.startsWith(root + "/"))) continue;
        if ((e.content ?? "").length < (opts.minSize ?? 1)) continue;
        const k = e.content ?? "";
        byContent.set(k, [...(byContent.get(k) ?? []), p]);
      }
      const groups = [...byContent.entries()]
        .filter(([, ps]) => ps.length > 1)
        .map(([content, ps]) => ({
          size: content.length,
          hash: String(content.length) + ps[0],
          files: ps.sort().map((p) => ({
            path: p,
            name: baseName(p),
            modified: this.fs.get(p)!.modified,
          })),
        }))
        .sort(
          (a, b) =>
            b.size * (b.files.length - 1) - a.size * (a.files.length - 1)
        );
      return json({
        id: "scan1",
        path: root,
        options: { includeHidden: false, exclude: [], ...opts },
        status: done ? "done" : "running",
        progress: {
          phase: done ? "done" : "hashing",
          filesSeen: 10,
          candidates: 4,
          hashed: done ? 4 : 2,
          bytesRead: 1000,
        },
        startedAt: new Date().toISOString(),
        result: done
          ? {
              groups,
              reclaimable: groups.reduce(
                (n, g) => n + g.size * (g.files.length - 1),
                0
              ),
              filesSeen: 10,
            }
          : undefined,
      });
    }
    // Storage view (4.0 5.1): size tree two levels deep + largest files.
    if (api.startsWith("/usage/tree")) {
      const root = norm(
        decodeURIComponent(api.slice("/usage/tree".length)) || "/"
      );
      if (!this.fs.get(root)?.isDir) return text("404 Not Found", 404);
      const depth = Number(query.depth ?? 2);
      const inside = (p: string, dir: string) =>
        dir === "/" ? p !== "/" : p.startsWith(dir + "/");
      const filesUnder = (dir: string) =>
        [...this.fs.keys()]
          .filter((p) => inside(p, dir) && !this.fs.get(p)!.isDir)
          .map((p) => this.item(p));
      const node = (p: string, level: number): Record<string, unknown> => {
        const it = this.item(p);
        if (!it.isDir)
          return {
            name: it.name,
            path: p,
            size: it.size,
            files: 1,
            isDir: false,
            kind: it.type === "blob" ? undefined : it.type,
          };
        const fs = filesUnder(p);
        return {
          name: it.name,
          path: p,
          size: fs.reduce((n, f) => n + f.size, 0),
          files: fs.length,
          isDir: true,
          children:
            level < depth
              ? this.children(p)
                  .map((c) => node(c, level + 1))
                  .sort((a, b) => (b.size as number) - (a.size as number))
              : undefined,
        };
      };
      const largest = filesUnder(root)
        .sort((a, b) => b.size - a.size)
        .slice(0, 50)
        .map((f) => ({
          path: f.path,
          name: f.name,
          size: f.size,
          modified: f.modified,
          kind: f.type === "blob" ? undefined : f.type,
        }));
      return json({
        root: node(root, 0),
        largest,
        computedAt: new Date().toISOString(),
        disk: { total: 1e12, used: 2.5e11 },
      });
    }
    if (api.startsWith("/usage")) return json({ total: 1e12, used: 2.5e11 });
    if (api === "/tags") return json([]);
    if (api.startsWith("/files-tags")) return json([]);
    if (api === "/trash" && method === "GET")
      return json(
        [...this.trash].reverse().map((t) => {
          const root = t.subtree.find(([k]) => k === t.path)![1];
          return {
            id: t.id,
            name: baseName(t.path),
            originalPath: t.path,
            originalDir: parentOf(t.path),
            isDir: root.isDir,
            size: (root.content ?? "").length,
            trashedAt: new Date().toISOString(),
            user: "admin",
          };
        })
      );
    if (api.startsWith("/trash/") && method === "POST") {
      const id = decodeURIComponent(api.slice("/trash/".length));
      const i = this.trash.findIndex((t) => t.id === id);
      if (i < 0) return text("404 Not Found", 404);
      const [t] = this.trash.splice(i, 1);
      for (const [k, e] of t.subtree) this.fs.set(k, e);
      return json({ path: t.path });
    }
    if (api === "/tags/batch") return json({});
    // The admin settings fetch is optional for the listing; the real server
    // answers it, the UI tolerates a miss.
    if (api === "/settings" && method === "GET")
      return text("404 Not Found", 404);
    if (/^\/users\/\d+$/.test(api)) {
      if (method === "PUT") {
        const body = JSON.parse(req.postData() ?? "{}") as {
          data?: { preferences?: Record<string, unknown> };
        };
        if (body.data?.preferences) this.preferences = body.data.preferences;
        return text("", 200);
      }
      return json({ ...USER, preferences: this.preferences });
    }
    // Background transfers: the work happens instantly; polls report it done.
    if (api === "/jobs" && method === "POST") {
      const body = JSON.parse(req.postData() ?? "{}") as {
        kind: "move" | "copy";
        items: { from: string; to: string }[];
      };
      for (const it of body.items)
        this.move(norm(it.from), norm(it.to), body.kind === "copy");
      const now = new Date().toISOString();
      const job = {
        id: `j${this.jobs.length + 1}`,
        kind: body.kind,
        status: "completed",
        name: body.items.length === 1 ? baseName(norm(body.items[0].from)) : "",
        dest: parentOf(norm(body.items[0]?.to ?? "/")),
        toPaths: body.items.map((i) => norm(i.to)),
        fromPaths: body.items.map((i) => norm(i.from)),
        itemCount: body.items.length,
        totalBytes: 0,
        doneBytes: 0,
        fileCount: body.items.length,
        filesDone: body.items.length,
        currentName: "",
        currentTo: "",
        createdAt: now,
        startedAt: now,
        finishedAt: now,
      };
      this.jobs.push(job);
      // Like the real registry, the enqueue snapshot is always pre-scheduled
      // ("queued"); the UI reloads when a later poll sees it settle.
      return json({ ...job, status: "queued" });
    }
    if (api === "/jobs") return json(this.jobs);
    if (api.startsWith("/jobs/")) {
      const job = this.jobs.find((j) => j.id === api.slice("/jobs/".length));
      return job ? json(job) : text("404 Not Found", 404);
    }
    if (api.startsWith("/webhooks")) {
      const pub = (w: Record<string, unknown>) => {
        const { secret, apiKey, ...rest } = w;
        return { ...rest, hasSecret: !!secret, hasApiKey: !!apiKey };
      };
      const m = /^\/webhooks(?:\/(\d+))?(?:\/(test|secret))?$/.exec(api);
      if (!m) return text("404 Not Found", 404);
      const [, id, action] = m;
      const ep = this.webhooks.find((w) => w.id === id);
      if (!id && method === "GET")
        return json({
          endpoints: this.webhooks.map(pub),
          eventTypes: ["file.created", "file.uploaded", "file.deleted"],
        });
      if (!id && method === "POST") {
        const body = JSON.parse(req.postData() || "{}");
        const w = { ...body, id: String(this.webhooks.length + 1) };
        this.webhooks.push(w);
        return json(pub(w));
      }
      if (!ep) return text("404 Not Found", 404);
      if (action === "test") return json({ ok: true, code: 204 });
      if (action === "secret") {
        if (method === "DELETE") {
          delete ep.secret;
          return text("", 200);
        }
        ep.secret = `whsec_${"ab".repeat(32)}`;
        return json({ secret: ep.secret });
      }
      if (method === "PUT") {
        const body = JSON.parse(req.postData() || "{}");
        Object.assign(ep, body, { apiKey: body.apiKey || ep.apiKey });
        return json(pub(ep));
      }
      if (method === "DELETE") {
        this.webhooks.splice(this.webhooks.indexOf(ep), 1);
        return text("", 200);
      }
    }
    if (api === "/shares") return json(this.shares);
    if (api.startsWith("/share/")) {
      const rest = api.slice("/share".length);
      if (method === "DELETE") {
        const i = this.shares.findIndex((x) => x.hash === rest.slice(1));
        if (i >= 0) this.shares.splice(i, 1);
        return text("", 200);
      }
      const p = norm(rest);
      if (method === "POST") {
        const body = JSON.parse(req.postData() || "{}") as {
          maxDownloads?: number;
          mode?: string;
          perUploaderFolder?: boolean;
        };
        const link = {
          hash: `h${this.shares.length + 1}`,
          path: p,
          expire: 0,
          userID: 1,
          views: 0,
          downloads: 0,
          maxDownloads: body.maxDownloads || undefined,
          mode: body.mode || undefined,
          perUploaderFolder: body.perUploaderFolder || undefined,
        };
        this.shares.push(link);
        return json(link);
      }
      return json(this.shares.filter((x) => x.path === p));
    }
    // Drop-box uploads.
    const up = /^\/public\/upload\/([^/]+)$/.exec(api);
    if (up && method === "POST") {
      const link = this.shares.find((x) => x.hash === up[1]);
      if (!link || link.mode !== "upload") return text("404 Not Found", 404);
      const name = query.name ?? "";
      if (!name || name.includes("/") || name === "..")
        return text("400 Bad Request", 400);
      let dir = link.path;
      if (link.perUploaderFolder)
        dir = `${dir}/${(query.uploader || "Anonymous").replace(/[/\\]/g, "")}`;
      let final = name;
      for (let i = 2; this.fs.has(norm(`${dir}/${final}`)); i++) {
        const dot = name.lastIndexOf(".");
        final =
          dot > 0
            ? `${name.slice(0, dot)} (${i})${name.slice(dot)}`
            : `${name} (${i})`;
      }
      this.changeOnDisk(
        `${dir}/${final}`,
        req.postDataBuffer()?.toString() ?? ""
      );
      link.uploads = (link.uploads ?? 0) + 1;
      return json({ name: final, size: 0 });
    }
    // Public share pages (no auth).
    const pub = /^\/public\/(share|dl)\/([^/]+)(\/.*)?$/.exec(api);
    if (pub) {
      const [, kind, hash, sub = ""] = pub;
      const link = this.shares.find((x) => x.hash === hash);
      if (!link) return text("404 Not Found", 404);
      if (link.mode === "upload") {
        if (kind === "dl") return text("404 Not Found", 404);
        link.views++;
        return json({
          mode: "upload",
          name: baseName(link.path),
          hash,
          perUploaderFolder: link.perUploaderFolder,
        });
      }
      const limited = (link.maxDownloads ?? 0) > 0;
      if (limited && link.downloads >= link.maxDownloads!)
        return text("410 Gone", 410);
      const target = norm(link.path + sub);
      const e = this.fs.get(target);
      if (!e) return text("404 Not Found", 404);
      link.lastAccessAt = Math.floor(Date.now() / 1000);
      if (kind === "share") {
        if (sub === "" || sub === "/") link.views++;
        const body = e.isDir ? this.listing(target) : this.item(target);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: limited
            ? {
                "X-Share-Downloads-Left": String(
                  link.maxDownloads! - link.downloads
                ),
              }
            : {},
          body: JSON.stringify({ ...body, hash }),
        });
      }
      if (limited || query.inline !== "true") link.downloads++;
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: this.binary.get(target) ?? e.content ?? "",
      });
    }
    // Structured search (saved searches, 4.0 5.3): q, type, size and age.
    if (api.startsWith("/search/recursive")) {
      const root = norm(
        decodeURIComponent(api.slice("/search/recursive".length)) || "/"
      );
      const minSize = query.minSize ? Number(query.minSize) : -1;
      const maxSize = query.maxSize ? Number(query.maxSize) : -1;
      const newer = query.newer ? Number(query.newer) * 1000 : 0;
      const filesOnly = !!(
        query.type ||
        query.ext ||
        query.minSize ||
        query.maxSize
      );
      const hits = [...this.fs.keys()]
        .filter((p) => p !== root && (root === "/" || p.startsWith(root + "/")))
        .map((p) => this.item(p))
        .filter(
          (i) =>
            !(filesOnly && i.isDir) &&
            (!query.type || i.type === query.type) &&
            (minSize < 0 || i.size >= minSize) &&
            (maxSize < 0 || i.size <= maxSize) &&
            (!newer || Date.parse(i.modified) >= newer) &&
            (!query.q || i.name.toLowerCase().includes(query.q.toLowerCase()))
        )
        .map((i) => ({
          path: i.path,
          name: i.name,
          size: i.size,
          modified: i.modified,
          isDir: i.isDir,
          type: i.type,
        }));
      return json(hits);
    }
    if (api.startsWith("/search")) return text("", 200);

    this.unhandled.push(`${method} ${api}`);
    return text("404 Not Found", 404);
  }
}

/** Logs in through the real login form against the fake server. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/files\//);
}
