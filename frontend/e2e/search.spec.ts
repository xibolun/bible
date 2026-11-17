import { test, expect, type Page } from "@playwright/test";

async function submit(page: Page, pattern: string) {
  const input = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await input.fill(pattern);
  await input.press("Enter");
  await expect(
    page.locator(".scripture-search .ant-spin-spinning"),
  ).toHaveCount(0);
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
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
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
