import { test, expect, type Page } from "@playwright/test";

async function submit(page: Page, pattern: string) {
  const input = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await input.fill(pattern);
  await input.press("Enter");
  // Spin delays its indicator; absence alone does not mean the request completed.
  if (pattern.endsWith("\\")) {
    await expect(page.locator(".scripture-search [role=alert]")).toBeVisible();
  } else {
    await expect(
      page
        .locator(".search-history-items button")
        .filter({ hasText: pattern })
        .first(),
    ).toBeVisible();
  }
}
test("offline LIKE search paginates and jumps to verses in the same or another chapter", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  await submit(page, "起%神");
  await expect(
    page.getByRole("button", { name: "前往创世记1:1", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("scripture-like-search.png"),
    animations: "disabled",
  });
  await context.setOffline(true);
  await submit(page, "神");
  await expect(page.locator(".search-results li")).toHaveCount(30);
  const first = await page
    .locator(".search-results strong")
    .first()
    .textContent();
  await page.locator(".ant-pagination-next button").click();
  await expect(page.locator(".search-results strong").first()).not.toHaveText(
    first!,
  );
  await submit(page, "生命树");
  await page
    .getByRole("button", { name: "前往创世记2:9", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "创世记第 2 章", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.locator('[data-translation="cuv"][data-verse="9"]'),
  ).toContainText("生命树");
  await expect(
    page.getByRole("button", { name: "选择中文第9节", exact: true }),
  ).toBeInViewport();
  await submit(page, "安息");
  await page
    .getByRole("button", { name: "前往创世记2:2", exact: true })
    .click();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "选择中文第2节", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("dialog", { name: "经文搜索", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-translation="cuv"][data-verse="2"] .search-keyword'),
  ).toContainText("安息");
  await page.locator('[data-translation="cuv"][data-verse="2"]').click();
  await expect(
    page.getByRole("dialog", { name: "经文搜索", exact: true }),
  ).toHaveCount(0);
  await page.locator("h1").click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "创世记第 3 章", exact: true }),
  ).toBeVisible();
});

test("search keeps editing shortcuts, validates patterns and switches translation on result navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  const input = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await input.fill("起%神");
  await input.press("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 1 章", exact: true }),
  ).toBeVisible();
  await submit(page, "完全不存在xyz");
  await expect(
    page.getByText("没有找到符合条件的经文", { exact: true }),
  ).toBeVisible();
  await submit(page, "test\\");
  await expect(
    page
      .getByRole("dialog", { name: "经文搜索", exact: true })
      .getByRole("alert"),
  ).toContainText("检查转义符");
  await page.getByRole("combobox", { name: "搜索译本", exact: true }).click();
  await page
    .locator(".ant-select-dropdown")
    .getByText("KJV · King James Version (1769)", { exact: true })
    .click();
  await submit(page, "beginning%God");
  await page
    .getByRole("button", { name: "前往创世记1:1", exact: true })
    .click();
  await expect(page.locator('[data-translation="kjv"]').first()).toContainText(
    "In the beginning God",
  );
});

test("consecutive hits retain results, highlight the destination and persist reusable history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  await submit(page, "生命树");
  const drawer = page.getByRole("dialog", { name: "经文搜索", exact: true });
  await expect(drawer).toHaveAttribute("aria-modal", "false");
  await page
    .getByRole("button", { name: "前往创世记2:9", exact: true })
    .click();
  await expect(
    page.locator('.is-search-target [data-verse="9"] .search-keyword'),
  ).toHaveText("生命树");
  await expect(drawer).toBeVisible();
  await page
    .getByRole("button", { name: "前往创世记3:22", exact: true })
    .click();
  await expect(
    page.locator('.is-search-target [data-verse="22"] .search-keyword'),
  ).toHaveText("生命树");
  await expect(
    page.locator('[data-translation="cuv"][data-verse="22"]'),
  ).toBeInViewport();
  await expect(drawer).toBeVisible();
  await expect(page.locator(".search-keyword")).toHaveCount(0, {
    timeout: 8000,
  });
  await submit(page, "起%神");
  await submit(page, "生命树");
  const history = page.getByRole("region", { name: "搜索历史", exact: true });
  await expect(
    history.getByRole("button", { name: "CUV · 生命树", exact: true }),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
            .searchHistory?.length,
      ),
    )
    .toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  await page.getByRole("button", { name: "CUV · 起%神", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "前往创世记1:1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清空历史", exact: true }).click();
  await expect(history).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
            .searchHistory?.length,
      ),
    )
    .toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  await expect(history).toHaveCount(0);
});

test("docked search fits a narrow window and temporary marks preserve saved highlights", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "绿色高亮", exact: true }).click();
  const original = await page
    .locator('[data-translation="cuv"][data-verse="1"]')
    .textContent();
  const stored = await page.evaluate(() =>
    localStorage.getItem("bible:mock:highlights"),
  );
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  await submit(page, "起%神");
  await page
    .getByRole("button", { name: "前往创世记1:1", exact: true })
    .click();
  const verse = page.locator('[data-translation="cuv"][data-verse="1"]');
  await expect(verse.locator(".search-keyword")).toHaveText(["起", "神"]);
  await expect(verse).toHaveText(original!);
  const bounds = await page
    .getByRole("dialog", { name: "经文搜索", exact: true })
    .boundingBox();
  const content = await verse.boundingBox();
  expect(content!.x + content!.width).toBeLessThanOrEqual(bounds!.x);
  await expect(
    page.getByRole("combobox", { name: "搜索译本", exact: true }),
  ).toBeInViewport();
  await expect(page.locator(".ant-pagination-next button")).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("search-target-narrow.png"),
    animations: "disabled",
  });
  await verse.click();
  await expect(
    page.getByRole("dialog", { name: "经文搜索", exact: true }),
  ).toHaveCount(0);
  await expect(verse).toBeInViewport();
  await expect(verse.locator(".search-keyword")).toHaveCount(0, {
    timeout: 8000,
  });
  await expect(verse.locator("mark")).toHaveCSS(
    "background-color",
    "rgb(205, 236, 205)",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("bible:mock:highlights")),
  ).toBe(stored);
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(original!);
});
