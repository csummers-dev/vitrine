import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";

const posts: string[] = [];
vi.mock("@/api", () => ({
  files: {
    post: vi.fn((path: string) => {
      posts.push(path);
      return new Promise<void>(() => {}); // stays in flight
    }),
    cancelUpload: vi.fn(),
  },
}));
vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/buttons", () => ({
  default: { loading: vi.fn(), success: vi.fn() },
}));
vi.mock("@/api/tus", () => ({ abortAllUploads: vi.fn() }));

import { useUploadStore } from "@/stores/upload";
import { useAuthStore } from "@/stores/auth";
import {
  usePreferences,
  __resetPreferencesForTests,
} from "@/composables/usePreferences";
import { baseUser } from "@/composables/__tests__/_prefsHarness";

beforeEach(() => {
  posts.length = 0;
  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia);
  app.provide("$showError", vi.fn());
  setActivePinia(pinia);
  useAuthStore().setUser(baseUser());
  __resetPreferencesForTests();
});

const file = () => ({ size: 10 }) as unknown as File;

describe("upload store — concurrency preference (5.4)", () => {
  it("starts at most the preferred number, and more when it's raised", async () => {
    void usePreferences().set("upload.concurrency", 2);
    const u = useUploadStore();
    for (let i = 0; i < 6; i++)
      u.upload("/files/D/", `f${i}`, file(), false, "file");
    await nextTick();
    expect(posts).toHaveLength(2);

    void usePreferences().set("upload.concurrency", 4);
    await nextTick();
    await nextTick();
    expect(posts).toHaveLength(4);
  });
});
