/**
 * Screenshot baselines for the Phase 6 interface refresh. Each state is shot
 * in light and dark at the sizes it matters for, named
 * `<screen>-<theme>-<size>.png`. Update with the "Update screenshots"
 * workflow or scripts/visual-docker.sh --update-snapshots.
 */
import type { Page } from "@playwright/test";
import { login } from "../support/fakeServer";
import type { FakeServer } from "../support/fakeServer";
import { row } from "../support/test";
import {
  test,
  expect,
  snap,
  shotName,
  SIZES,
  THEMES,
  type SizeName,
} from "./fixtures";

type Ctx = { page: Page; fake: FakeServer };

type Screen = {
  name: string;
  sizes: SizeName[];
  /** Brings the page to the state to shoot (not signed in yet). */
  open: (c: Ctx) => Promise<void>;
};

const signedIn = async ({ page, fake }: Ctx) => {
  await fake.install(page);
  await login(page);
};

const SCREENS: Screen[] = [
  {
    name: "login",
    sizes: ["desktop", "phone"],
    open: async ({ page, fake }) => {
      await fake.install(page);
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    },
  },
  {
    name: "files-root",
    sizes: ["desktop", "laptop", "phone"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
    },
  },
  {
    name: "files-folder",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/files/Documents/");
      await expect(row(c.page, "budget.csv")).toBeVisible();
    },
  },
  {
    name: "files-mosaic",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      c.fake.user = { viewMode: "mosaic" };
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
    },
  },
  {
    name: "files-context-menu",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
      await row(c.page, "readme.md").click({ button: "right" });
      await expect(
        c.page.getByRole("menuitem", { name: "Rename", exact: true })
      ).toBeVisible();
    },
  },
  {
    name: "files-gallery",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      c.fake.user = { viewMode: "mosaic gallery" };
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
    },
  },
  {
    name: "details-one",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await row(c.page, "readme.md").click();
      await expect(c.page.getByTestId("details-text-preview")).toContainText(
        "vitrine"
      );
      await c.page.mouse.move(0, 0);
    },
  },
  {
    name: "details-multi",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await row(c.page, "photo.jpg").click();
      await row(c.page, "readme.md").click({ modifiers: ["Shift"] });
      await expect(c.page.getByTestId("details-multi")).toBeVisible();
      await c.page.mouse.move(0, 0);
    },
  },
  {
    name: "details-overlay",
    sizes: ["tablet"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
      await c.page
        .getByRole("button", { name: "Details", exact: true })
        .click();
      await expect(c.page.getByTestId("details-scrim")).toBeVisible();
    },
  },
  {
    name: "details-sheet",
    sizes: ["phone"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
      await c.page
        .getByRole("button", { name: "Details", exact: true })
        .first()
        .click();
      await expect(c.page.getByTestId("details-panel")).toBeVisible();
    },
  },
  {
    name: "files-empty",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      c.fake.fs.set("/Empty", {
        isDir: true,
        modified: c.fake.fs.get("/Music")!.modified,
      });
      await signedIn(c);
      await c.page.goto("/files/Empty/");
      await expect(c.page.getByText("Empty is empty")).toBeVisible();
    },
  },
  {
    name: "files-error",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/files/Missing/");
      await expect(c.page.getByTestId("listing-error")).toBeVisible();
    },
  },
  {
    name: "saved-search",
    sizes: ["desktop"],
    open: async (c) => {
      c.fake.preferences = {
        "search.saved": [
          { id: "s1", name: "Text files", query: "ext:md", folder: "/" },
        ],
      };
      await signedIn(c);
      await c.page.goto("/files/?saved=s1");
      await expect(c.page.getByTestId("saved-search-head")).toBeVisible();
    },
  },
  {
    name: "storage-dupes",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      c.fake.changeOnDisk(
        "/Photos/2026/harbour copy.jpg",
        "x".repeat(2_400_000)
      );
      c.fake.dupeScan = { opts: { path: "/", minSize: 1 }, polls: 1 };
      await signedIn(c);
      await c.page.goto("/storage");
      await expect(c.page.getByTestId("storage-dupes-pill")).toBeVisible();
    },
  },
  {
    name: "duplicates-idle",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/duplicates");
      await expect(c.page.getByText("Find duplicate files")).toBeVisible();
    },
  },
  {
    name: "duplicates-results",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      c.fake.changeOnDisk(
        "/Photos/2026/harbour copy.jpg",
        "x".repeat(2_400_000)
      );
      c.fake.changeOnDisk(
        "/Documents/notes copy.txt",
        "hello from notes\n".repeat(40)
      );
      c.fake.dupeScan = { opts: { path: "/", minSize: 1 }, polls: 1 };
      await signedIn(c);
      await c.page.goto("/duplicates");
      await expect(c.page.getByTestId("dupes-groups")).toBeVisible();
    },
  },
  {
    name: "duplicates-none",
    sizes: ["desktop"],
    open: async (c) => {
      c.fake.dupeScan = { opts: { path: "/Music", minSize: 1 }, polls: 1 };
      await signedIn(c);
      await c.page.goto("/duplicates");
      await expect(c.page.getByTestId("dupes-none")).toBeVisible();
    },
  },
  {
    name: "trash-items",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      await signedIn(c);
      await c.page.evaluate(async () => {
        for (const p of [
          "/api/resources/archive.zip",
          "/api/resources/Projects/",
        ])
          await fetch(p, { method: "DELETE" });
      });
      await c.page.goto("/trash");
      await expect(c.page.getByText("archive.zip")).toBeVisible();
    },
  },
  {
    name: "settings-home",
    sizes: ["phone"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/settings");
      await expect(c.page.getByTestId("settings-home")).toBeVisible();
    },
  },
  {
    name: "settings-users",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/settings/users");
      await expect(c.page.getByText("sam")).toBeVisible();
    },
  },
  {
    name: "share-panel",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await row(c.page, "Documents").click({ button: "right" });
      await c.page
        .getByRole("menuitem", { name: "Share", exact: true })
        .click();
      await expect(c.page.getByTestId("share-link-type")).toBeVisible();
    },
  },
  {
    name: "public-folder",
    sizes: ["desktop", "phone"],
    open: async ({ page, fake }) => {
      fake.shares.push({
        hash: "pf",
        path: "/Documents",
        expire: 0,
        userID: 1,
        views: 0,
        downloads: 0,
      });
      await fake.install(page);
      await page.goto("/share/pf");
      await expect(page.getByTestId("share-brand")).toBeVisible();
      await expect(row(page, "notes.txt")).toBeVisible();
    },
  },
  {
    name: "public-file",
    sizes: ["phone"],
    open: async ({ page, fake }) => {
      fake.shares.push({
        hash: "pr",
        path: "/readme.md",
        expire: 0,
        userID: 1,
        views: 0,
        downloads: 0,
      });
      await fake.install(page);
      await page.goto("/share/pr");
      await expect(page.getByText("readme.md").first()).toBeVisible();
    },
  },
  {
    name: "public-dropbox",
    sizes: ["phone"],
    open: async ({ page, fake }) => {
      fake.shares.push({
        hash: "pd",
        path: "/Documents",
        expire: 0,
        userID: 1,
        views: 0,
        downloads: 0,
        mode: "upload",
      });
      await fake.install(page);
      await page.goto("/share/pd");
      await expect(page.getByTestId("dropbox")).toBeVisible();
    },
  },
  {
    name: "public-gone",
    sizes: ["desktop"],
    open: async ({ page, fake }) => {
      fake.shares.push({
        hash: "pg",
        path: "/readme.md",
        expire: 0,
        userID: 1,
        views: 0,
        downloads: 1,
        maxDownloads: 1,
      });
      await fake.install(page);
      await page.goto("/share/pg");
      await expect(page.getByTestId("share-gone")).toBeVisible();
    },
  },
  {
    name: "upgrade-banner",
    sizes: ["desktop"],
    open: async (c) => {
      c.fake.upgradeNotice = {
        from: 3,
        to: 4,
        backup: "/database/vitrine.db.pre-4.0.bak",
        at: "2026-10-01T12:00:00Z",
      };
      await signedIn(c);
      await expect(c.page.getByTestId("upgrade-banner")).toBeVisible();
    },
  },
  {
    name: "shell-collapsed",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
      await c.page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(
        c.page.getByRole("button", { name: "Expand sidebar" })
      ).toBeVisible();
    },
  },
  {
    name: "shell-drawer",
    sizes: ["phone"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
      await c.page
        .getByRole("button", { name: "Open navigation menu" })
        .click();
      await expect(
        c.page.getByRole("button", { name: "Storage" })
      ).toBeVisible();
    },
  },
  {
    name: "shell-split",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await expect(row(c.page, "readme.md")).toBeVisible();
      await c.page.getByRole("button", { name: "More", exact: true }).click();
      await c.page
        .getByRole("menuitem", { name: "Split view", exact: true })
        .click();
      await expect(
        c.page.getByRole("grid", { name: "Files in the second pane" })
      ).toBeVisible();
      await c.page.mouse.move(0, 0);
    },
  },
  {
    name: "recent",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      const now = c.fake.clock ?? Date.now();
      c.fake.preferences = {
        recents: [
          {
            path: "/readme.md",
            name: "readme.md",
            isDir: false,
            accessedAt: now - 5 * 60e3,
          },
          {
            path: "/Documents/budget.csv",
            name: "budget.csv",
            isDir: false,
            accessedAt: now - 3 * 3600e3,
          },
          {
            path: "/Documents/notes.txt",
            name: "notes.txt",
            isDir: false,
            accessedAt: now - 2 * 86400e3,
          },
        ],
      };
      await signedIn(c);
      await c.page.goto("/recent");
      await expect(c.page.getByTestId("recent-list")).toBeVisible();
    },
  },
  {
    name: "storage",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/storage");
      await expect(c.page.getByTestId("storage-map")).toBeVisible();
    },
  },
  {
    name: "trash-empty",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/trash");
      await expect(c.page.getByText(/trash is empty/i)).toBeVisible();
    },
  },
  {
    name: "settings-profile",
    sizes: ["desktop", "phone"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/settings/profile");
      await expect(
        c.page
          .getByTestId("two-factor-settings")
          .or(c.page.getByRole("heading").first())
          .first()
      ).toBeVisible();
    },
  },
  {
    name: "settings-global",
    sizes: ["desktop"],
    open: async (c) => {
      await signedIn(c);
      await c.page.goto("/settings/global");
      await expect(c.page.getByRole("heading").first()).toBeVisible();
    },
  },
  {
    name: "setup-2fa",
    sizes: ["desktop"],
    open: async (c) => {
      c.fake.requireAdminTwoFactor = true;
      await signedIn(c);
      await expect(c.page.getByTestId("two-factor-setup")).toBeVisible();
    },
  },
];

for (const theme of THEMES) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, locale: "en-US", timezoneId: "UTC" });

    for (const screen of SCREENS) {
      for (const size of screen.sizes) {
        test(`${screen.name} ${size}`, async ({ page, fake }) => {
          await page.setViewportSize(SIZES[size]);
          await screen.open({ page, fake });
          await snap(page, shotName(screen.name, theme, size));
        });
      }
    }
  });
}
