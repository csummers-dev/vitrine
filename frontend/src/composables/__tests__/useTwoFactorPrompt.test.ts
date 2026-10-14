import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetTwoFactorPromptForTests,
  skipTwoFactorSetup,
  twoFactorSetupRedirect,
} from "@/composables/useTwoFactorPrompt";

const to = (fullPath: string, requiresAdmin = false, name?: string) => ({
  name,
  fullPath,
  requiresAdmin,
});

beforeEach(() => __resetTwoFactorPromptForTests());

describe("twoFactorSetupRedirect", () => {
  it("leaves everyone else alone", () => {
    expect(twoFactorSetupRedirect(null, to("/files/"))).toBeNull();
    expect(twoFactorSetupRedirect({}, to("/settings/global", true))).toBeNull();
  });

  it("sends a flagged admin to set-up once, then only from admin pages", () => {
    const admin = { twoFactorSetupRequired: true };
    expect(twoFactorSetupRedirect(admin, to("/files/Movies/"))).toEqual({
      name: "TwoFactorSetup",
      query: { redirect: "/files/Movies/" },
    });
    // Never redirects the set-up page to itself.
    expect(
      twoFactorSetupRedirect(admin, to("/setup-2fa", false, "TwoFactorSetup"))
    ).toBeNull();

    skipTwoFactorSetup();
    expect(twoFactorSetupRedirect(admin, to("/files/"))).toBeNull();
    expect(
      twoFactorSetupRedirect(admin, to("/settings/global", true))
    ).toMatchObject({ name: "TwoFactorSetup" });
  });
});
