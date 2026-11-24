import { test, expect, type Page } from "./fixtures";
import formatExamples from "../../testdata/passage-formats.json" with { type: "json" };
import { referenceStyles } from "../src/shared/formatting";

async function selectVersion(page: Page, name: string, option: string) {
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
  await page.getByRole("switch", { name: "多译本对照" }).click();
  await expect(
    page.locator('[data-translation="user:e2e-webp"]').first(),
  ).toContainText("In the beginning");
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
    .toContain("创世记1:1");
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
  await expect(
    page.getByRole("button", { name: "专注阅读", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".sidebar")).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.locator('[data-translation="cuv"]').first().locator("mark"),
  ).toContainText("起初");
  await page.locator('[data-book="PSA"]').click();
  await page.getByRole("button", { name: "第150章", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "诗篇第 150 章" }),
  ).toBeVisible();
});

test("invalid mixed-translation selection and explicit service error", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "多译本对照" }).click();
  await page.waitForSelector('[data-translation="user:e2e-webp"]');
  await page.evaluate(() => {
    const a = document.querySelector('[data-translation="cuv"]')!.firstChild!,
      b = document.querySelector(
        '[data-translation="user:e2e-webp"]',
      )!.firstChild!;
    const r = document.createRange();
    r.setStart(a, 0);
    r.setEnd(b, 3);
    window.getSelection()!.addRange(r);
    document
      .querySelector(".verses")!
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(
    page.getByText(
      "请选择同一个译本内的经文，不能混合译本选择；连续多节可使用 Shift 点击。",
    ),
  ).toBeVisible();
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await page.goto("/?mockError=data");
  await expect(
    page.getByRole("alert").filter({ hasText: "模拟 data 操作失败" }),
  ).toBeVisible();
});

test("CUV/WEBP stacked versions, selected-version copy, highlights and cards", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "多译本对照" }).click();
  await selectVersion(page, "主译本", "WEBP · en");
  await expect(
    page.locator('[data-translation="user:e2e-webp"]').first(),
  ).toContainText("the heavens and the earth");
  await expect(page.locator('[data-translation="cuv"]').first()).toContainText(
    "起初",
  );
  const firstRow = page.locator(".verse-row").first();
  await expect(firstRow.locator(".verse-cell")).toHaveCount(2);
  const layout = await firstRow.locator(".verse-cell").evaluateAll((cells) =>
    cells.map((cell) => {
      const rect = cell.getBoundingClientRect(),
        style = getComputedStyle(cell);
      return {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        lineRatio: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
      };
    }),
  );
  expect(layout[0].bottom).toBeLessThanOrEqual(layout[1].top);
  expect(layout[0].left).toBe(layout[1].left);
  expect(layout[0].lineRatio).toBeLessThanOrEqual(1.6);
  await expect(page.locator(".reference, .verse-number")).toHaveCount(0);
  expect(await firstRow.locator(".verse-select").allTextContents()).toEqual([
    "1",
    "1",
  ]);
  const cells = await firstRow.locator(".verse-cell").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left };
    }),
  );
  expect(cells[1].top).toBeGreaterThanOrEqual(cells[0].bottom);
  expect(cells.map((cell) => cell.left)).toEqual([
    cells[0].left,
    cells[0].left,
  ]);
  await expect(
    page.locator(".verse-number,.reference,.reference-heading"),
  ).toHaveCount(0);
  const lineHeight = await firstRow
    .locator(".verse-cell")
    .first()
    .evaluate(
      (element) =>
        parseFloat(getComputedStyle(element).lineHeight) /
        parseFloat(getComputedStyle(element).fontSize),
    );
  expect(lineHeight).toBeLessThanOrEqual(1.6);
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect(
    page.getByRole("combobox", { name: "主译本", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("combobox", { name: "对照译本", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "设置", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("user:e2e-webp-reader-1024.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "选择WEBP第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "绿色高亮", exact: true }).click();
  await expect(
    page.locator('[data-translation="user:e2e-webp"]').first().locator("mark"),
  ).toContainText("In the beginning");
  await page.getByRole("toolbar").locator(".ant-dropdown-trigger").click();
  await page.getByText("复制当前对照", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("In the beginning");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("起初");
  expect(copied).toContain("创世记1:1·WEBP");
  expect(copied).toContain("the heavens and the earth");

  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  await selectVersion(page, "卡片语言", "当前对照 · WEBP + CUV");
  await expect(page.getByRole("button", { name: "导出 PNG" })).toBeEnabled();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG" }).click();
  const download = await pending;
  await download.saveAs(
    test.info().outputPath("user:e2e-webp-comparison-card.png"),
  );
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();

  await page.reload();
  await expect(
    page.locator('[data-translation="user:e2e-webp"]').first().locator("mark"),
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

test("legacy settings, bilingual interface and reference placement in keyboard copy", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("bible:mock:preferences"))
      localStorage.setItem(
        "bible:mock:preferences",
        JSON.stringify({
          bookId: "GEN",
          chapter: 1,
          translations: ["cuv", "user:e2e-webp"],
          parallel: false,
          fontSize: 20,
          schemaVersion: 1,
        }),
      );
  });
  await page.goto("/");
  await expect(page.locator(".verses")).toHaveCSS("font-size", "20px");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByText("经文之前", { exact: true }).click();
  await panel
    .getByRole("spinbutton", { name: "阅读字号", exact: true })
    .fill("");
  await panel
    .getByRole("spinbutton", { name: "阅读字号", exact: true })
    .pressSequentially("22");
  await panel
    .getByRole("spinbutton", { name: "阅读字号", exact: true })
    .press("Tab");
  await selectVersion(page, "界面语言", "English");
  await panel.getByRole("tab", { name: "About", exact: true }).click();
  await expect(
    panel.getByText(
      `Application version ${process.env.BIBLE_APP_VERSION || "0.1.0"}`,
    ),
  ).toBeVisible();
  await expect(
    panel.getByText("WEBP · World English Bible", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("settings-about-en.png"),
    animations: "disabled",
  });
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Genesis Chapter 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".verses")).toHaveCSS("font-size", "22px");
  await page
    .getByRole("button", { name: "Select CUV verse 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/^Genesis 1:1·CUV\n起初/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences")!)
            .uiLanguage,
      ),
    )
    .toBe("en");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".verses")).toHaveCSS("font-size", "22px");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await panel.getByText("After text", { exact: true }).click();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  const first = page.getByRole("button", {
    name: "Select CUV verse 1",
    exact: true,
  });
  await first.focus();
  await first.press("Enter");
  await expect(page.getByRole("toolbar")).toBeInViewport();
  await page.keyboard.press("ControlOrMeta+C");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/起初[\s\S]*\n— Genesis 1:1·CUV$/);
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export PNG", exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Card translation", exact: true }),
  ).toBeVisible();
});

test("all 150 Psalm chapter buttons wrap at the minimum window width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/");
  await page.locator('[data-book="PSA"]').click();
  await expect(page.locator(".chapter-button")).toHaveCount(150);
  const dimensions = await page
    .locator(".chapter-strip")
    .evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.clientHeight,
    }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.height).toBeGreaterThan(100);
  await expect(
    page.getByRole("button", { name: "第150章", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "第150章", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "诗篇第 150 章" }),
  ).toBeVisible();
  await expect(page.locator(".verse-scroll")).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("wrapped-psalms-1024.png"),
    animations: "disabled",
  });
});

test("selection actions follow the endpoint, fit edges and close when scrolled away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/");
  await expect(page.locator("[data-verse-text]").first()).toBeVisible();
  const textBounds = (await page
    .locator("[data-verse-text]")
    .first()
    .boundingBox())!;
  const dragY = textBounds.y + textBounds.height / 2;
  await page.mouse.move(textBounds.x + 1, dragY);
  await page.mouse.down();
  await page.mouse.move(textBounds.x + 70, dragY, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("toolbar")).toBeInViewport();
  await page.keyboard.press("ControlOrMeta+C");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("创世记1:1·CUV");
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page
    .getByRole("button", { name: "选择中文第3节", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByRole("toolbar")).toContainText("已选 3 段");
  const point = await page.evaluate(() => {
    const viewport = document
      .querySelector(".verse-scroll")!
      .getBoundingClientRect();
    const candidates = [
      ...document.querySelectorAll<HTMLElement>("[data-verse-text]"),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom < viewport.bottom - 12 && rect.top > viewport.top + 10;
    });
    const element = candidates.at(-1)!;
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    return { clientX: window.innerWidth - 6, clientY: viewport.bottom - 12 };
  });
  await page.locator(".verses").dispatchEvent("mouseup", point);
  const toolbar = page.getByRole("toolbar");
  await expect(toolbar).toBeInViewport();
  const initial = (await toolbar.boundingBox())!;
  expect(initial.height).toBeLessThan(60);
  expect(initial.x).toBeGreaterThanOrEqual(8);
  expect(initial.x + initial.width).toBeLessThanOrEqual(1016);
  expect(initial.y + initial.height).toBeLessThan(point.clientY);
  expect(point.clientY - (initial.y + initial.height)).toBeLessThan(40);
  await page.screenshot({
    path: test.info().outputPath("selection-actions-edge.png"),
    animations: "disabled",
  });
  await page.locator(".verse-scroll").evaluate((element) => {
    element.scrollTop += 20;
  });
  await expect
    .poll(async () => Math.round((await toolbar.boundingBox())!.y))
    .toBe(Math.round(initial.y - 20));
  await page.locator(".verse-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(toolbar).toHaveCount(0);
});

test("seven copy presets, per-verse cards and external GitHub source", async ({
  page,
  context,
}) => {
  await context.route("https://github.com/xibolun/bible", (route) =>
    route.fulfill({ body: "Source repository" }),
  );
  await page.goto("/");
  await page.locator('[data-book="ECC"]').click();
  await expect(
    page.locator(".verse-row").first().locator(".verse-select"),
  ).toHaveText("1");
  await expect(page.locator(".verse-row").first()).not.toContainText("CUV");
  for (const sample of formatExamples.cases) {
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await selectVersion(
      page,
      "复制样式",
      referenceStyles.find((style) => style.value === sample.style)!.zh,
    );
    await expect(page.locator(".format-preview")).toBeVisible();
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page
      .getByRole("button", { name: "选择中文第6节", exact: true })
      .click();
    await page
      .getByRole("button", { name: "选择中文第7节", exact: true })
      .click({ modifiers: ["Shift"] });
    await expect(page.getByRole("toolbar")).toContainText("已选 2 段");
    await page.keyboard.press("ControlOrMeta+C");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(sample.expected);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences")!)
            .referenceStyle,
      ),
    )
    .toBe("verses-full");
  await page.reload();
  await page
    .getByRole("button", { name: "选择中文第6节", exact: true })
    .click();
  await page
    .getByRole("button", { name: "选择中文第7节", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  for (const [style, name] of [
    ["逐节简称引用", "card-per-verse.png"],
    ["全书名", "card-full-without-edition.png"],
  ]) {
    await selectVersion(page, "卡片引用样式", style);
    await expect(
      page.getByRole("button", { name: "导出 PNG", exact: true }),
    ).toBeEnabled();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 PNG", exact: true }).click();
    await (await pending).saveAs(test.info().outputPath(name));
  }
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "复制样式", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("copy-format-settings.png"),
    animations: "disabled",
  });
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "访问源码", exact: true }).click();
  const source = await opened;
  await expect(source).toHaveURL("https://github.com/xibolun/bible");
  await source.close();
});

test("chapter list follows controls and keyboard shortcuts respect control context", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "创世记第 1 章", exact: true }),
  ).toBeVisible();
  const controls = await page.locator(".reader-toolbar").boundingBox();
  const chapters = await page.locator(".chapter-nav").boundingBox();
  expect(chapters!.y).toBeGreaterThanOrEqual(controls!.y + controls!.height);
  await expect(page.locator(".chapter-edge")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "专注阅读", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "创世记第 2 章", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "第2章", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "创世记第 3 章", exact: true }),
  ).toBeVisible();
  await page.locator("h1").click();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 2 章", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "创世记第 2 章", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "主译本", exact: true })
    .press("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 2 章", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-book="PSA"]').click();
  await page.getByRole("button", { name: "第150章", exact: true }).click();
  await page.locator("h1").click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "箴言第 1 章", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一章", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: test.info().outputPath("reader-navigation.png"),
  });
});

test("licensed Chinese original-language notes work offline from selected verses", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "选择中文第1节", exact: true })
    .click();
  await page.getByRole("button", { name: "原文注解", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "原文字典注解" });
  await expect(drawer.getByText("H7225 · 希伯来文")).toBeVisible();
  const initialMeaning = drawer.locator(".chinese-meaning");
  await expect(initialMeaning).toContainText("首先");
  await expect(initialMeaning).toBeInViewport();
  await expect(initialMeaning).not.toContainText("AV -");
  await drawer.getByText("KJV 经节关联词组", { exact: true }).click();
  await drawer.getByRole("button", { name: "God H430", exact: true }).click();
  const definition = drawer.getByRole("article", { name: "词典释义" });
  await expect(definition).toContainText("אֱלֹהִים");
  await expect(definition).toContainText("獨一的 (真) 神");
  await expect(definition).toContainText("信望愛資訊中心");
  await expect(drawer).toContainText("KJV 3.1 Strong’s");
  await context.setOffline(true);
  const query = drawer.getByRole("searchbox", { name: "Strong’s 编号" });
  await query.fill("g03056");
  await query.press("Enter");
  await expect(definition).toContainText("λόγος");
  await expect(definition).toContainText("話語");
  await page.screenshot({
    path: test.info().outputPath("chinese-dictionary.png"),
  });
  await query.fill("bad");
  await query.press("Enter");
  await expect(drawer.getByRole("alert")).toContainText("请输入 Strong’s 编号");
  await query.fill("G99999");
  await query.press("Enter");
  await expect(drawer.getByRole("alert")).toContainText("内置词典没有此");
  await page.keyboard.press("Escape");
  await page.locator('[data-book="JHN"]').click();
  await page.getByRole("button", { name: "原文字典", exact: true }).click();
  await drawer.getByText("KJV 经节关联词组", { exact: true }).click();
  await drawer
    .getByRole("button", { name: "the Word G3056", exact: true })
    .first()
    .click();
  await expect(definition).toContainText("話語");
  await page.keyboard.press("Escape");
  await context.setOffline(false);
  await page.getByRole("button", { name: "下一章", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "约翰福音第 2 章" }),
  ).toBeVisible();
});

test("dictionary data failure is visible and can be retried", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/chinese-dictionary.json", (route) =>
    fail ? route.abort() : route.continue(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "原文字典", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "原文字典注解" });
  await expect(drawer.getByRole("alert")).toContainText("内置资料不可用");
  fail = false;
  await drawer.getByRole("button", { name: "重试", exact: true }).click();
  await expect(drawer.getByRole("article", { name: "词典释义" })).toContainText(
    "H7225",
  );
});
