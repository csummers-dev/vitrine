import { test, expect, contextAction } from "./support/test";

// 4.0: when extraction is refused, the toast says why, in the server's
// words, instead of "check the server logs".

for (const [status, body, shown] of [
  [
    507,
    "507 Insufficient Storage (not enough space: needs 48.2 GB, 31.0 GB free)",
    "Not enough space: needs 48.2 GB, 31.0 GB free.",
  ],
  [
    422,
    '422 Unprocessable Entity (archive entry "zeros.bin" exceeds safe compression ratio)',
    'Archive entry "zeros.bin" exceeds safe compression ratio.',
  ],
] as const) {
  test(`a refused extraction says why (${status})`, async ({ app, fake }) => {
    fake.changeOnDisk("/backup.zip", "PK");
    fake.unzipResponse = { status, body };
    await app.reload();
    await contextAction(app, "backup.zip", "Extract");
    await app.locator(".extract-btn--primary").click();
    await expect(app.getByText(shown)).toBeVisible();
    // Not mistaken for a password problem.
    await expect(app.getByRole("dialog", { name: /password/i })).toHaveCount(0);
  });
}
