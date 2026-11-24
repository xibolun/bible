import { expect, test, type Page } from "@playwright/test";

async function downloads(page: Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("tab", { name: "译本管理", exact: true }).click();
  await page.getByRole("button", { name: "下载译本", exact: true }).click();
  return page.getByRole("dialog", {
    name: "下载译本 · CrossWire",
    exact: true,
  });
}
test("CrossWire browser filters Chinese and English samples and confirms an offline user edition", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("switch", { name: "多译本对照", exact: true }),
  ).toBeDisabled();
  const source = await downloads(page);
  await expect(source).toContainText("浏览器模拟");
  await expect(
    source.getByText("中文示例（模拟）", { exact: true }),
  ).toBeVisible();
  const unsupported = source.getByRole("row").filter({ hasText: "不兼容示例" });
  await expect(
    unsupported.getByRole("button", { name: "下载", exact: true }),
  ).toBeDisabled();
  await source
    .getByRole("combobox", { name: "下载译本语言", exact: true })
    .click();
  await page
    .locator(".ant-select-dropdown")
    .getByText("英文", { exact: true })
    .click();
  await expect(
    source.getByText("中文示例（模拟）", { exact: true }),
  ).toHaveCount(0);
  await source
    .getByRole("searchbox", { name: "搜索下载译本", exact: true })
    .fill("TEST_EN");
  await expect(
    source.getByText("English sample (Mock)", { exact: true }),
  ).toBeVisible();
  await source.getByRole("button", { name: "下载", exact: true }).click();
  const preview = page.getByRole("dialog", {
    name: "本地译本导入",
    exact: true,
  });
  await expect(preview).toContainText(
    "Download sample: morning light. Not scripture.",
  );
  await expect(preview).toContainText("另存为用户译本");
  await expect(
    page.getByRole("combobox", { name: "主译本", exact: true }).locator(".."),
  ).toContainText("CUV");
  await preview.getByRole("button", { name: "确认导入", exact: true }).click();
  await preview.getByRole("button", { name: "开始阅读", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toContainText(
    "Download sample: morning light.",
  );
  await expect(
    page.getByRole("switch", { name: "多译本对照", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.locator(".verse-scroll")).toContainText("Not scripture.");
  await context.setOffline(true);
  await expect(page.locator(".verse-scroll")).toContainText("Not scripture.");
});

test("download catalogue errors can be retried and cancellation never installs an edition", async ({
  page,
}) => {
  await page.goto("/?mockError=source");
  const source = await downloads(page);
  await expect(
    source.getByRole("alert").filter({ hasText: "无法连接CrossWire" }),
  ).toBeVisible();
  await page.evaluate(() => history.replaceState(null, "", "/"));
  await source.getByRole("button", { name: "刷新列表", exact: true }).click();
  const row = source.getByRole("row").filter({ hasText: "中文示例（模拟）" });
  await row.getByRole("button", { name: "下载", exact: true }).click();
  const preview = page.getByRole("dialog", {
    name: "本地译本导入",
    exact: true,
  });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: /取消|关闭/, exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "译本管理", exact: true }),
  ).toContainText("尚未导入译本");
});
