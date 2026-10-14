/**
 * "Require two-factor for admins" (4.0): an admin without a second factor
 * is sent to the set-up page after signing in. They may skip it for the
 * session and keep using their files, but admin pages send them back,
 * since the server refuses admin requests until it's set up.
 */
const KEY = "vitrine:2fa-setup-skipped";
let skipped = false;

const read = (): boolean => {
  try {
    return skipped || sessionStorage.getItem(KEY) === "1";
  } catch {
    return skipped;
  }
};

export function skipTwoFactorSetup(): void {
  skipped = true;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode: the in-memory flag covers this tab */
  }
}

/** Where the router should send this user instead, or null to proceed. */
export function twoFactorSetupRedirect(
  user: { twoFactorSetupRequired?: boolean } | null,
  to: { name?: unknown; fullPath: string; requiresAdmin: boolean }
): { name: string; query: { redirect: string } } | null {
  if (!user?.twoFactorSetupRequired || to.name === "TwoFactorSetup") {
    return null;
  }
  if (to.requiresAdmin || !read()) {
    return { name: "TwoFactorSetup", query: { redirect: to.fullPath } };
  }
  return null;
}

export function __resetTwoFactorPromptForTests(): void {
  skipped = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
