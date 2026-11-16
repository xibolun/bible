import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});
test("offline reader, persistence, bilingual copy and exact-size PNG", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "创世记第 1 章" }),
  ).toBeVisible();
  await expect(page.locator(".book-button")).toHaveCount(66);
  await page.getByRole("switch", { name: "中英对照" }).click();
  await expect(page.locator('[data-translation="webp"]').first()).toContainText(
    "In the beginning",
  );
  await page.screenshot({
    path: test.info().outputPath("reader.png"),
    animations: "disabled",
  });
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "黄色高亮", exact: true }).click();
  await expect(
    page.locator('[data-translation="cuv"]').first().locator("mark"),
  ).toContainText("起初");
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("创世记 1:1");
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  await expect(page.getByRole("button", { name: "导出 PNG" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("card-editor.png"),
    animations: "disabled",
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG" }).click();
  const file = await download;
  await file.saveAs(test.info().outputPath("scripture-card.png"));
  expect(file.suggestedFilename()).toContain("1080x1080");
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const c of stream!) chunks.push(c);
  const bytes = Buffer.concat(chunks);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1080);
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();
  await page.getByRole("button", { name: "专注阅读", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.locator('[data-translation="cuv"]').first().locator("mark"),
  ).toContainText("起初");
  await page.locator('[data-book="PSA"]').click();
  await page.getByRole("button", { name: "向后滚动章号" }).click();
  await page.getByRole("button", { name: "第150章", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "诗篇第 150 章" }),
  ).toBeVisible();
});

test("invalid cross-column selection and explicit service error", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "中英对照" }).click();
  await page.waitForSelector('[data-translation="webp"]');
  await page.evaluate(() => {
    const a = document.querySelector('[data-translation="cuv"]')!.firstChild!,
      b = document.querySelector('[data-translation="webp"]')!.firstChild!;
    const r = document.createRange();
    r.setStart(a, 0);
    r.setEnd(b, 3);
    window.getSelection()!.addRange(r);
    document
      .querySelector(".verses")!
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(
    page.getByText("请选择同一个译本内的经文，不能跨列选择。"),
  ).toBeVisible();
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await page.goto("/?mockError=data");
  await expect(
    page.getByRole("alert").filter({ hasText: "模拟 data 操作失败" }),
  ).toBeVisible();
});
