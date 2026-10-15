/**
 * Accessibility check for e2e tests (Phase 6). Runs axe on the page and
 * fails on serious or critical WCAG 2.1 A/AA violations. Wired into the
 * suites in Step 3; known issues are listed by rule id in `allow` with a
 * reason, never silenced wholesale.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectAccessible(
  page: Page,
  opts: { include?: string; allow?: string[] } = {}
): Promise<void> {
  let axe = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  if (opts.include) axe = axe.include(opts.include);
  if (opts.allow?.length) axe = axe.disableRules(opts.allow);
  const { violations } = await axe.analyze();
  const bad = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ` +
        v.nodes
          .slice(0, 5)
          .map(
            (n) =>
              n.target.join(" ") +
              (n.failureSummary
                ? `\n      ${n.failureSummary.replace(/\n/g, "\n      ")}`
                : "")
          )
          .join("\n    ")
    );
  expect(bad, "accessibility violations").toEqual([]);
}
