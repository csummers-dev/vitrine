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
