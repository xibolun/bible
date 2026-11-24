import { test, expect } from "@playwright/test";

test("only CUV and WEBP ship in the scripture dataset and edition picker", async ({
  page,
}) => {
  const response = await page.request.get("/dataset.json");
  const data = await response.json();
  expect(data.translations.map((tr: { id: string }) => tr.id)).toEqual([
    "cuv",
    "webp",
  ]);
  expect(
    Object.keys(data.chapters).every((key) => /^(cuv|webp)\//.test(key)),
  ).toBe(true);
  await page.goto("/");
  await page.getByRole("combobox", { name: "主译本", exact: true }).click();
  const menu = page.locator(".ant-select-dropdown");
  await expect(menu.getByText("CUV · 简体中文", { exact: true })).toBeVisible();
  await expect(menu.getByText("WEBP · English", { exact: true })).toBeVisible();
  await expect(menu.getByText(/^(KJV|DBY) ·/)).toHaveCount(0);
});

test("legacy KJV and Darby preferences fall back while preserving reading settings and valid history", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("bible:mock:preferences"))
      localStorage.setItem(
        "bible:mock:preferences",
        JSON.stringify({
          translations: ["dby", "kjv", "webp"],
          bookId: "JHN",
          chapter: 3,
          fontSize: 24,
          searchHistory: [
            { translationId: "kjv", pattern: "old edition" },
            { translationId: "webp", pattern: "God%world" },
          ],
        }),
      );
  });
  await page.goto("/");
  await expect(
    page.locator('[data-translation="webp"][data-verse="16"]'),
  ).toContainText("God so loved");
  await expect(page.locator(".verses")).toHaveCSS("font-size", "24px");
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "经文搜索", exact: true });
  await expect(drawer).toContainText("God%world");
  await expect(drawer).not.toContainText("old edition");
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await expect(
    page.locator('[data-translation="webp"][data-verse="16"]'),
  ).toContainText("God so loved");
});
