import { test, expect } from "@playwright/test";

test("soft reading themes cover the reader and persist without resetting reading position", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "第2章", exact: true }).click();
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "黄色高亮", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const choices = page.getByRole("group", { name: "阅读主题", exact: true });
  await choices.getByRole("button", { name: "柔绿色" }).click();
  await expect(page.locator(".reader-shell")).toHaveCSS(
    "background-color",
    "rgb(237, 242, 235)",
  );
  await choices.getByRole("button", { name: "暖纸色" }).click();
  await expect(page.locator(".reader-shell")).toHaveCSS(
    "background-color",
    "rgb(246, 241, 230)",
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath("reading-theme-paper.png"),
  });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await choices.getByRole("button", { name: "静谧夜读" }).click();
  await expect(page.locator(".reader-shell")).toHaveCSS(
    "background-color",
    "rgb(36, 44, 43)",
  );
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(30, 38, 37)",
  );
  await expect(page.getByRole("button", { name: "完成", exact: true })).toHaveCSS("background-color", "rgb(44, 54, 51)");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath("reading-theme-night.png"),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") ?? "{}")
            .readingTheme,
      ),
    )
    .toBe("night");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "创世记第 2 章" }),
  ).toBeVisible();
  await expect(page.locator(".reader-shell")).toHaveCSS(
    "background-color",
    "rgb(36, 44, 43)",
  );
  await expect(
    page.locator('[data-translation="cuv"]').first().locator("mark"),
  ).toContainText("天地");
  await expect(page.locator("mark").first()).toHaveCSS(
    "color",
    "rgb(39, 57, 69)",
  );
});
