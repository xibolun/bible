import { expect, test, type Page } from "@playwright/test";

async function downloads(page: Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("tab", { name: "译本管理", exact: true }).click();
  const manager = page.getByRole("region", { name: "译本管理", exact: true });
  await expect(
    manager.getByRole("row").filter({ hasText: "CUV" }),
  ).toContainText("内置译本");
  await expect(
    page.getByRole("region", { name: "CrossWire 下载列表", exact: true }),
  ).toHaveCount(0);
  await manager
    .getByRole("radio", { name: "下载译本", exact: true })
    .locator("..")
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  return manager;
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
  await source.getByRole("combobox", { name: "译本语言", exact: true }).click();
  await page
    .locator(".ant-select-dropdown")
    .getByText("英文", { exact: true })
    .click();
  await expect(
    source.getByText("中文示例（模拟）", { exact: true }),
  ).toHaveCount(0);
  await source
    .getByRole("searchbox", { name: "搜索译本", exact: true })
    .fill("TEST_EN");
  await expect(
    source.getByText("English sample (Mock)", { exact: true }),
  ).toBeVisible();
  await source
    .getByRole("radio", { name: "已安装", exact: true })
    .locator("..")
    .click();
  await expect(
    source.getByRole("searchbox", { name: "搜索译本", exact: true }),
  ).toHaveValue("");
  const bundled = source.getByRole("row").filter({ hasText: "CUV" });
  await expect(bundled.getByRole("switch")).toHaveCount(0);
  await expect(
    bundled.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  await source
    .getByRole("radio", { name: "下载译本", exact: true })
    .locator("..")
    .click();
  await expect(
    source.getByRole("searchbox", { name: "搜索译本", exact: true }),
  ).toHaveValue("TEST_EN");
  await source.getByRole("button", { name: "详情", exact: true }).click();
  await expect(source).toContainText(
    "Self-authored test sample, not a Bible edition",
  );
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await source.getByRole("button", { name: "下载", exact: true }).click();
  const preview = page.getByRole("dialog", {
    name: "本地译本导入",
    exact: true,
  });
  await expect(preview).toContainText(
    "Download sample: morning light. Not scripture.",
  );
  await expect(preview).toContainText("另存为用户译本");
  await preview
    .getByRole("textbox", { name: /译本名称/ })
    .fill("My English edition");
  await expect(
    page.getByRole("combobox", { name: "主译本", exact: true }).locator(".."),
  ).toContainText("CUV");
  await preview.getByRole("button", { name: "确认导入", exact: true }).click();
  await preview
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const installed = source
    .getByRole("row")
    .filter({ hasText: "English sample (Mock)" });
  await expect(installed).toContainText("已安装");
  await expect(
    installed.getByRole("button", { name: "下载", exact: true }),
  ).toHaveCount(0);
  await expect(
    installed.getByRole("switch", {
      name: "启用 My English edition",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    installed.getByRole("button", { name: "替换", exact: true }),
  ).toBeVisible();
  await expect(
    installed.getByRole("button", { name: "删除", exact: true }),
  ).toBeVisible();
  await source
    .getByRole("radio", { name: "已安装", exact: true })
    .locator("..")
    .click();
  await expect(
    source.getByRole("row").filter({ hasText: "My English edition" }),
  ).toBeVisible();
  await source
    .getByRole("radio", { name: "下载译本", exact: true })
    .locator("..")
    .click();
  await installed.getByRole("button", { name: "阅读", exact: true }).click();
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
    row.getByRole("button", { name: "下载", exact: true }),
  ).toBeVisible();
  await expect(row.getByRole("switch")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "下载", exact: true }),
  ).toBeEnabled();
  await source
    .getByRole("radio", { name: "已安装", exact: true })
    .locator("..")
    .click();
  await expect(
    page.getByRole("region", { name: "译本管理", exact: true }),
  ).toContainText("尚未导入译本");
});

test("integrated manager stays usable at large type and manages a downloaded edition in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "bible:mock:preferences",
      JSON.stringify({ globalFontSize: 20 }),
    ),
  );
  await page.goto("/");
  const manager = await downloads(page);
  const row = manager.locator('tr[data-row-key="TEST_ZH"]');
  await row.getByRole("button", { name: "详情", exact: true }).click();
  await expect(manager).toContainText("自编测试示例，非圣经译本正文");
  await page.screenshot({
    path: test.info().outputPath("integrated-editions-large-type.png"),
    animations: "disabled",
  });
  const drawer = page.getByRole("dialog", { name: "设置", exact: true });
  const bounds = await drawer.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(1024);
  const overflow = await drawer.evaluate(
    (el) => el.scrollWidth - el.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await row.getByRole("button", { name: "下载", exact: true }).click();
  const preview = page.getByRole("dialog", {
    name: "本地译本导入",
    exact: true,
  });
  await preview.getByRole("button", { name: "确认导入", exact: true }).click();
  await preview
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(row).toContainText("已安装");
  await row.getByRole("switch").click();
  await page
    .getByRole("dialog", { name: "停用 中文示例（模拟）？", exact: true })
    .getByRole("button", { name: "停用", exact: true })
    .click();
  await expect(row).toContainText("已停用");
  await expect(
    row.getByRole("button", { name: "启用并阅读", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    history.replaceState(null, "", "/?mockError=source"),
  );
  await manager.getByRole("button", { name: "刷新列表", exact: true }).click();
  await expect(
    manager.getByRole("alert").filter({ hasText: "无法连接CrossWire" }),
  ).toBeVisible();
  await manager
    .getByRole("radio", { name: "已安装", exact: true })
    .locator("..")
    .click();
  await expect(
    manager.getByRole("alert").filter({ hasText: "无法连接CrossWire" }),
  ).not.toBeVisible();
  const local = manager
    .getByRole("row")
    .filter({ hasText: "中文示例（模拟）" });
  await local.getByRole("button", { name: "删除", exact: true }).click();
  await page
    .getByRole("dialog", { name: "删除 中文示例（模拟）？", exact: true })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(local).toHaveCount(0);
  await manager
    .getByRole("radio", { name: "下载译本", exact: true })
    .locator("..")
    .click();
  await expect(
    row.getByRole("button", { name: "下载", exact: true }),
  ).toBeVisible();
  await expect(row.getByRole("switch")).toHaveCount(0);
});

test("changing interface language keeps the hidden catalogue cached without requesting the source", async ({
  page,
}) => {
  await page.goto("/");
  const manager = await downloads(page);
  await expect(manager.locator('tr[data-row-key="TEST_ZH"]')).toBeVisible();
  await manager
    .getByRole("radio", { name: "已安装", exact: true })
    .locator("..")
    .click();
  await page.evaluate(() =>
    history.replaceState(null, "", "/?mockError=source"),
  );
  await page.getByRole("tab", { name: "阅读与复制", exact: true }).click();
  await page.getByRole("combobox", { name: "界面语言", exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("English", { exact: true })
    .click();
  await page.getByRole("tab", { name: "Editions", exact: true }).click();
  await page
    .getByRole("radio", { name: "Download editions", exact: true })
    .locator("..")
    .click();
  const catalogue = page.getByRole("region", {
    name: "CrossWire downloads",
    exact: true,
  });
  await expect(catalogue.locator('tr[data-row-key="TEST_ZH"]')).toBeVisible();
  await expect(catalogue.getByRole("alert")).toHaveCount(1);
  await expect(catalogue.getByRole("alert")).toContainText("Browser Mock");
});
