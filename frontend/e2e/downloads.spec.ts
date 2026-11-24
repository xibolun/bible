import { expect, test, type Page } from "@playwright/test";

async function manager(page: Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("tab", { name: "译本管理", exact: true }).click();
  return page.getByRole("region", { name: "译本管理", exact: true });
}
const row = (page: Page, id = "TEST_EN") =>
  page.locator('tr[data-module="' + id + '"]');
async function refresh(page: Page, url: string) {
  await page.evaluate((value) => history.replaceState(null, "", value), url);
  await page.getByRole("button", { name: "刷新列表", exact: true }).click();
}
async function download(page: Page, id = "TEST_EN") {
  await row(page, id)
    .getByRole("button", { name: "下载", exact: true })
    .click();
  await expect(
    row(page, id).getByRole("status", { name: "译本下载进度", exact: true }),
  ).toBeVisible();
  await expect(
    row(page, id).getByRole("button", { name: "下载", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "本地译本导入", exact: true }),
  ).toHaveCount(0);
  await expect(row(page, id).getByRole("switch")).toBeChecked();
}
const library = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("bible:mock:user-editions") || '{"installs":[]}',
      ).installs,
  );

test("one flat bilingual list installs downloads with inline progress and separates enable from actions", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const region = await manager(page);
  await expect(
    region.getByRole("combobox", { name: "译本语言", exact: true }),
  ).toHaveCount(0);
  await expect(
    region.getByRole("radiogroup", { name: "译本列表", exact: true }),
  ).toHaveCount(0);
  await expect(row(page, "TEST_ZH")).toContainText("中文示例");
  await expect(row(page)).toContainText("English sample");
  const bundled = region.getByRole("row").filter({ hasText: "CUV" });
  await expect(bundled).toContainText("内置译本");
  await expect(bundled.getByRole("switch")).toHaveCount(0);
  await expect(
    bundled.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  await expect(
    region.getByRole("button", { name: "替换", exact: true }),
  ).toHaveCount(0);
  await expect(
    row(page, "TEST_UNSUPPORTED").getByRole("button", {
      name: "下载",
      exact: true,
    }),
  ).toBeDisabled();
  await download(page);
  await expect(
    region.getByRole("columnheader", { name: "启用", exact: true }),
  ).toBeVisible();
  await expect(
    row(page).getByRole("cell").nth(2).getByRole("switch"),
  ).toBeChecked();
  await expect(
    row(page).getByRole("cell").nth(3).getByRole("switch"),
  ).toHaveCount(0);
  await expect(
    row(page).getByRole("button", { name: "更新", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "主译本", exact: true }).locator(".."),
  ).toContainText("CUV");
  await row(page).getByRole("button", { name: "阅读", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toContainText(
    "Download sample: morning light.",
  );
  await page.reload();
  await expect(page.locator(".verse-scroll")).toContainText("Not scripture.");
  await context.setOffline(true);
  await expect(page.locator(".verse-scroll")).toContainText("Not scripture.");
});

test("source failure leaves local management usable and inline cancellation installs nothing", async ({
  page,
}) => {
  await page.goto("/?mockError=source");
  const region = await manager(page);
  await expect(
    region.getByRole("alert").filter({ hasText: "无法连接CrossWire" }),
  ).toBeVisible();
  await expect(
    region
      .getByRole("row")
      .filter({ hasText: "CUV" })
      .getByRole("button", { name: "阅读", exact: true }),
  ).toBeEnabled();
  await refresh(page, "/?mockSlowDownload=1");
  await row(page, "TEST_ZH")
    .getByRole("button", { name: "下载", exact: true })
    .click();
  await expect(row(page, "TEST_ZH").getByRole("status")).toBeVisible();
  await row(page, "TEST_ZH")
    .getByRole("button", { name: "取消下载", exact: true })
    .click();
  await expect(
    row(page, "TEST_ZH").getByRole("button", { name: "下载", exact: true }),
  ).toBeEnabled();
  expect(await library(page)).toHaveLength(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("failed automatic installation stays inline and can be retried", async ({
  page,
}) => {
  await page.goto("/?mockError=install");
  await manager(page);
  await row(page).getByRole("button", { name: "下载", exact: true }).click();
  await expect(row(page).getByRole("alert")).toBeVisible();
  await expect(row(page).getByRole("switch")).toHaveCount(0);
  expect(await library(page)).toHaveLength(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.evaluate(() => history.replaceState(null, "", "/"));
  await row(page).getByRole("button", { name: "重试", exact: true }).click();
  await expect(row(page).getByRole("switch")).toBeChecked();
  expect(await library(page)).toHaveLength(1);
});

test("updates preserve renamed disabled editions and old versions, without same-version or downgrade prompts", async ({
  page,
}) => {
  await page.goto("/");
  await manager(page);
  await download(page);
  const first = (await library(page))[0];
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("bible:mock:user-editions")!);
    const item = saved.installs[0];
    item.translation.name = "My English edition";
    item.report.name = "My English edition";
    saved.reports[item.translation.id][item.translation.dataVersion].name =
      "My English edition";
    localStorage.setItem("bible:mock:user-editions", JSON.stringify(saved));
  });
  await page.reload();
  await manager(page);
  await expect(row(page)).toContainText("My English edition");
  await row(page).getByRole("switch").click();
  await page
    .getByRole("dialog", { name: "停用 My English edition？", exact: true })
    .getByRole("button", { name: "停用", exact: true })
    .click();
  await refresh(page, "/?mockVersion=2");
  await row(page).getByRole("button", { name: "更新", exact: true }).click();
  await expect(row(page).getByRole("status")).toBeVisible();
  await expect(
    row(page).getByRole("button", { name: "更新", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await library(page))[0].report.sourceEdition)
    .toBe("2");
  let current = (await library(page))[0];
  expect(current.translation.id).toBe(first.translation.id);
  expect(current.translation.name).toBe("My English edition");
  expect(current.enabled).toBe(false);
  expect(current.versions).toHaveLength(2);
  await expect(row(page).getByRole("switch")).not.toBeChecked();
  await expect(
    row(page).getByRole("button", { name: "替换", exact: true }),
  ).toHaveCount(0);
  await row(page).getByRole("button", { name: "详情", exact: true }).click();
  await page
    .getByRole("combobox", { name: "恢复译本版次", exact: true })
    .click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .last()
    .click();
  await page.getByRole("button", { name: "恢复此版", exact: true }).click();
  await expect
    .poll(async () => (await library(page))[0].report.sourceEdition)
    .toBe("1");
  await row(page).getByRole("button", { name: "更新", exact: true }).click();
  await expect
    .poll(async () => (await library(page))[0].report.sourceEdition)
    .toBe("2");
  const fingerprint = (await library(page))[0].translation.dataVersion;
  await refresh(page, "/?mockVersion=2.1&mockTextVersion=2");
  await row(page).getByRole("button", { name: "更新", exact: true }).click();
  await expect
    .poll(async () => (await library(page))[0].report.sourceEdition)
    .toBe("2.1");
  current = (await library(page))[0];
  expect(current.translation.dataVersion).toBe(fingerprint);
  expect(current.versions).toHaveLength(2);
  expect(current.enabled).toBe(false);
  await expect(
    row(page).getByRole("button", { name: "更新", exact: true }),
  ).toHaveCount(0);
  await refresh(page, "/?mockVersion=1");
  await expect(
    row(page).getByRole("button", { name: "更新", exact: true }),
  ).toHaveCount(0);
  await row(page)
    .getByRole("button", { name: "启用并阅读", exact: true })
    .click();
  await expect(page.locator(".verse-scroll")).toContainText("Version 2.");
});

test("the flat catalogue and its inline actions fit large type at minimum bounds", async ({
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
  const region = await manager(page);
  await download(page, "TEST_ZH");
  await expect(
    row(page, "TEST_ZH").getByRole("cell").nth(2).getByRole("switch"),
  ).toBeChecked();
  await page.screenshot({
    path: test.info().outputPath("flat-editions-large-type.png"),
    animations: "disabled",
  });
  const drawer = page.getByRole("dialog", { name: "设置", exact: true });
  expect(
    await drawer.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await row(page, "TEST_ZH")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "删除 中文示例（模拟）？", exact: true })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(
    row(page, "TEST_ZH").getByRole("button", { name: "下载", exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole("columnheader", { name: "启用", exact: true }),
  ).toBeVisible();
});

test("changing interface language retains the catalogue without fetching again", async ({
  page,
}) => {
  await page.goto("/");
  await manager(page);
  await expect(row(page)).toBeVisible();
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
  await expect(row(page)).toBeVisible();
  const region = page.getByRole("region", {
    name: "Edition manager",
    exact: true,
  });
  await expect(region.getByRole("alert")).toHaveCount(1);
  await expect(region.getByRole("alert")).toContainText("Browser Mock");
});
