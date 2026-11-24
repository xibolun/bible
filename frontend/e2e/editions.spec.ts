import { expect, test, type Page } from "@playwright/test";
import { setPassage } from "./projection-helpers";

const fixture = (body = "导入样本：晨光照耀。[补词]") =>
  `<XMLBIBLE biblename="导入测试"><INFORMATION><identifier>TEST</identifier><language>zh</language><rights>CC0 self-authored synthetic test fixture; not a Bible translation.</rights></INFORMATION><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="1">${body}</VERS><VERS vnumber="3" e="4">合并样本。<BR/>第二行。</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
async function manager(page: Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("tab", { name: "译本管理", exact: true }).click();
  return page.getByRole("region", { name: "译本管理", exact: true });
}
async function inspect(page: Page, source: string, replace = false) {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", {
      name: replace ? "替换" : "导入译本文件",
      exact: true,
    })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "fixture.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  const dialog = page.getByRole("dialog", {
    name: "本地译本导入",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function install(page: Page, body?: string, replace = false) {
  const dialog = await inspect(page, fixture(body), replace);
  await expect(dialog.getByText("实际经文预览", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(dialog.getByText("译本已安装", { exact: true })).toBeVisible();
  return dialog;
}

test("imported partial edition persists, copies, highlights, exports and projects original joined references offline", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    if (!localStorage.getItem("bible:mock:preferences"))
      localStorage.setItem(
        "bible:mock:preferences",
        JSON.stringify({ globalFontSize: 20 }),
      );
  });
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/");
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await manager(page);
  const preview = await inspect(page, fixture());
  await expect(
    preview.getByText("实际经文预览", { exact: true }),
  ).toBeVisible();
  await expect(preview).toContainText("合并样本。");
  const bounds = await preview.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await page.screenshot({
    path: test.info().outputPath("edition-import-preview.png"),
    animations: "disabled",
  });
  await preview.getByRole("button", { name: "确认导入", exact: true }).click();
  await preview.getByRole("button", { name: "开始阅读", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toContainText(
    "导入样本：晨光照耀。[补词]",
  );
  await expect(page.locator(".book-button")).toHaveCount(1);
  await expect(page.locator(".chapter-button")).toHaveCount(1);
  const lineDistance = await page
    .locator('[data-row="3-4"] [data-verse-text]')
    .evaluate((element) => {
      const node = element.firstChild!;
      const text = node.textContent!;
      const at = text.indexOf("\n");
      if (at < 0) return -1;
      const first = document.createRange();
      first.setStart(node, 0);
      first.setEnd(node, at);
      const next = document.createRange();
      next.setStart(node, at + 1);
      next.setEnd(node, text.length);
      return (
        next.getBoundingClientRect().top - first.getBoundingClientRect().top
      );
    });
  expect(lineDistance).toBeGreaterThan(0);
  await expect(
    page.getByRole("switch", { name: "多译本对照", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "选择TEST第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "绿色高亮", exact: true }).click();
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("导入样本：晨光照耀。[补词]");
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导出 PNG", exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("bible-JHN-3-1");
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".verse-scroll mark")).toContainText("晨光");
  // A browser popup needs the Mock HTML/assets first; the native audience uses
  // embedded assets. Exercise subsequent source changes with networking off.
  await page.keyboard.press("F8");
  const firstInput = await setPassage(page, "yuehan", "3", "1");
  const firstPopup = page.waitForEvent("popup");
  await firstInput.press("Enter");
  const audience = await firstPopup;
  await expect(audience.locator(".projection-verses")).toContainText(
    "导入样本",
  );
  await page.bringToFront();
  await context.setOffline(true);
  await page.keyboard.press("Control+f");
  const search = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await search.fill("晨%照");
  await search.press("Enter");
  await page
    .getByRole("button", { name: "前往约翰福音3:1", exact: true })
    .click();
  await page.locator(".verse-scroll [data-verse-text]").first().click();
  await expect(page.locator(".scripture-search")).not.toBeVisible();
  await page.keyboard.press("F8");
  await expect(
    page.getByRole("dialog", { name: "经文投影 · F8", exact: true }),
  ).toBeVisible();
  const input = await setPassage(page, "yuehan", "3", "3");
  await input.press("Enter");
  await expect(audience.locator(".projection-reference")).toContainText(
    "约3:3-4",
  );
  await expect(audience.locator(".projection-verses")).toContainText(
    "合并样本。",
  );
  await expect(audience.locator(".projection-verses")).toContainText(
    "第二行。",
  );
  await page.screenshot({
    path: test.info().outputPath("imported-edition-projection.png"),
    animations: "disabled",
  });
});

test("version replacement and disabling or removing a current edition keep reading recoverable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await manager(page);
  let dialog = await install(page);
  await dialog.getByRole("button", { name: "开始阅读", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toContainText("晨光");
  await page.keyboard.press("Control+f");
  const search = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await search.fill("晨%照");
  await search.press("Enter");
  await page
    .getByRole("button", { name: "前往约翰福音3:1", exact: true })
    .click();
  await page.locator(".verse-scroll [data-verse-text]").first().click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("bible:mock:preferences") || "{}",
        ).searchHistory?.map((entry: { pattern: string }) => entry.pattern),
      ),
    )
    .toEqual(["晨%照"]);
  await manager(page);
  dialog = await install(page, "新版样本。", true);
  await dialog
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const region = page.getByRole("region", { name: "译本管理", exact: true });
  await region
    .getByRole("row")
    .filter({ hasText: "导入测试" })
    .getByRole("button", { name: "详情", exact: true })
    .click();
  const detail = region.getByRole("region", { name: "译本详情", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await detail
    .getByRole("combobox", { name: "恢复译本版次", exact: true })
    .click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .last()
    .click();
  await detail.getByRole("button", { name: "恢复此版", exact: true }).click();
  await expect(detail).not.toBeVisible();
  await region
    .getByRole("switch", { name: "启用 导入测试", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "停用 导入测试？", exact: true })
    .getByRole("button", { name: "停用", exact: true })
    .click();
  await expect(
    region.getByRole("switch", { name: "启用 导入测试", exact: true }),
  ).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
            .searchHistory,
      ),
    )
    .toEqual([]);
  dialog = await inspect(page, fixture());
  await dialog.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(dialog.getByText("此正文已存在", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "启用并阅读", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toContainText("晨光");
  await manager(page);
  await region.getByRole("button", { name: "删除", exact: true }).click();
  await page
    .getByRole("dialog", { name: "删除 导入测试？", exact: true })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(
    region.getByRole("row").filter({ hasText: "导入测试" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".book-button")).toHaveCount(66);
  await expect(page.locator(".verse-scroll")).toContainText("尼哥底母");
  await page.reload();
  await expect(page.locator(".verse-scroll")).toContainText("尼哥底母");
});

test("unsupported input shows an actionable error and never installs a placeholder edition", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await manager(page);
  const dialog = await inspect(page, "<unknown>not a Bible</unknown>");
  await expect(dialog.getByRole("alert")).toContainText(
    "此文件格式或标记尚不支持",
  );
  await dialog
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "译本管理", exact: true }),
  ).toContainText("尚未导入译本");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toContainText("起初");
});
