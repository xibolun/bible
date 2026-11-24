import { test as base, expect } from "@playwright/test";
import installedEdition from "../../testdata/webp-reader-fixture.json" with { type: "json" };

// Explicit additional user-edition setup for bilingual reading regressions.
// These selected public-domain excerpts are CI-only, outside application assets.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((edition) => {
      if (!localStorage.getItem("bible:mock:user-editions"))
        localStorage.setItem(
          "bible:mock:user-editions",
          JSON.stringify(edition),
        );
    }, installedEdition);
    await use(page);
  },
});
export { expect };
export type { Page } from "@playwright/test";
