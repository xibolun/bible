import { test, expect, type Page } from "@playwright/test";

async function selectVersion(page: Page, name: string, option: string) {
  const input = page.getByRole("combobox", { name, exact: true });
  await input.click();
  const list = await input.getAttribute("aria-controls");
  expect(list).toBeTruthy();
  await page
    .locator(".ant-select-dropdown")
    .filter({ has: page.locator(`[id="${list}"]`) })
    .getByText(option, { exact: true })
    .click();
}

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
  await page.getByRole("switch", { name: "双译本对照" }).click();
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
  await page.getByRole("switch", { name: "双译本对照" }).click();
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

test("SWORD KJV pairs, selected-pair copy, persistent highlights and cards", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "双译本对照" }).click();
  await selectVersion(page, "主译本", "KJV · English");
  await expect(page.locator('[data-translation="kjv"]').first()).toContainText(
    "the heaven and the earth",
  );
  await expect(page.locator('[data-translation="webp"]').first()).toContainText(
    "the heavens and the earth",
  );
  await expect(page.locator('[data-translation="cuv"]')).toHaveCount(0);

  await selectVersion(page, "对照译本", "CUV · 简体中文");
  await expect(page.locator('[data-translation="cuv"]').first()).toContainText(
    "起初",
  );
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect(
    page.getByRole("combobox", { name: "主译本", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("combobox", { name: "对照译本", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "缩小字体", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("kjv-reader-1024.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "选择KJV第1节", exact: true }).click();
  await page.getByRole("button", { name: "绿色高亮", exact: true }).click();
  await expect(
    page.locator('[data-translation="kjv"]').first().locator("mark"),
  ).toContainText("In the beginning");
  await page.getByRole("toolbar").locator(".ant-dropdown-trigger").click();
  await page.getByText("复制本节对照", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("KJV\nIn the beginning");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("CUV\n起初");
  expect(copied).not.toContain("WEBP");

  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  await selectVersion(page, "卡片语言", "当前对照 · KJV + CUV");
  await expect(page.getByRole("button", { name: "导出 PNG" })).toBeEnabled();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG" }).click();
  const download = await pending;
  await download.saveAs(test.info().outputPath("kjv-comparison-card.png"));
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();

  await selectVersion(page, "主译本", "CUV · 简体中文");
  await expect(page.locator('[data-verse="1"][data-translation]')).toHaveCount(
    2,
  );
  await page.reload();
  await expect(
    page.locator('[data-translation="kjv"]').first().locator("mark"),
  ).toContainText("In the beginning");
  await expect(page.locator('[data-verse="1"][data-translation]')).toHaveCount(
    2,
  );
});

test("card export errors preserve the editor and allow a direct retry", async ({
  page,
}) => {
  await page.goto("/?mockError=export");
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  const exportButton = page.getByRole("button", { name: "导出 PNG" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "模拟 export 操作失败" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await page.evaluate(() => history.replaceState({}, "", "/"));
  const download = page.waitForEvent("download");
  await exportButton.click();
  expect((await download).suggestedFilename()).toContain("1080x1080");
  await expect(page.getByRole("dialog")).toBeVisible();
});
