import { test, expect, type Page } from "@playwright/test";
import { entry, setPassage } from "./projection-helpers";

async function choose(page: Page, name: string, option: string) {
  const input = page.getByRole("combobox", { name, exact: true });
  const multiple = await input.evaluate((element) =>
    Boolean(element.closest(".ant-select-multiple")),
  );
  await input.click();
  const list = await input.getAttribute("aria-controls");
  expect(list).toBeTruthy();
  await page
    .locator(".ant-select-dropdown")
    .filter({ has: page.locator(`[id="${list}"]`) })
    .getByText(option, { exact: true })
    .click();
  if (multiple) await input.press("Escape");
}

test("Darby reading, annotations, copy and card export work offline and retain the translation", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await choose(page, "主译本", "DBY · English");
  const verse = page.locator('[data-translation="dby"][data-verse="1"]');
  await expect(verse).toHaveText(
    "In the beginning God created the heavens and the earth.",
  );
  await context.setOffline(true);
  await page.getByRole("button", { name: "选择DBY第1节", exact: true }).click();
  await page.getByRole("button", { name: "绿色高亮", exact: true }).click();
  await expect(verse.locator("mark")).toContainText("In the beginning");
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("创世记1:1·DBY");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("the heavens and the earth.");
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG", exact: true }).click();
  const download = await pending;
  await download.saveAs(test.info().outputPath("darby-card.png"));
  expect(download.suggestedFilename()).toContain("1080x1080");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "主译本", exact: true }).locator(".."),
  ).toContainText("DBY");
  await expect(verse.locator("mark")).toContainText("In the beginning");
});

test("Darby comparison, LIKE search and quick projection use its actual text", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await choose(page, "主译本", "DBY · English");
  await page.getByRole("switch", { name: "多译本对照", exact: true }).click();
  await choose(page, "对照译本", "KJV · English");
  await expect(page.locator('[data-translation="dby"]').first()).toContainText(
    "the heavens and the earth",
  );
  await expect(page.locator('[data-translation="kjv"]').first()).toContainText(
    "the heaven and the earth",
  );
  await context.setOffline(true);
  await page.getByRole("button", { name: "经文搜索", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await search.fill("only-begotten%Son");
  await search.press("Enter");
  await page
    .getByRole("button", { name: "前往约翰福音3:16", exact: true })
    .click();
  const verse = page.locator('[data-translation="dby"][data-verse="16"]');
  await expect(verse).toContainText(
    "that whosoever believes on him may not perish",
  );
  await verse.click();
  await expect(
    page.getByRole("dialog", { name: "经文搜索", exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.keyboard.press("F8");
  await expect(entry(page, "book")).toBeFocused();
  await choose(page, "投影译本", "DBY · Darby Translation（达秘译本）");
  const input = await setPassage(page, "John", "3", "16");
  const pending = page.waitForEvent("popup");
  await input.press("Enter");
  const audience = await pending;
  await expect(audience.locator(".projection-verses")).toContainText(
    "only-begotten Son",
  );
  await expect(audience.locator(".projection-verses")).toContainText(
    "have life eternal",
  );
  await expect(audience.locator(".projection-reference")).toContainText("DBY");
});
