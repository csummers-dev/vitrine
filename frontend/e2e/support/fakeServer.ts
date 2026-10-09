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
export function makeToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { user: USER, iat: now, exp: now + 2 * 60 * 60 };
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
  readonly trash: {
    id: string;
    path: string;
    subtree: [string, FakeEntry][];
  }[] = [];

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

    if (api === "/login" || api === "/renew") return text(makeToken());

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
    if (api.startsWith("/preview/"))
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PIXEL,
      });
    if (api.startsWith("/folder-size")) return json({ size: 0, count: 0 });
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
      if (method === "PUT") return text("", 200);
      return json(USER);
    }
    if (api === "/jobs") return json([]);
    if (api === "/shares") return json([]);
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
