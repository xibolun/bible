import { test, expect, type Page } from "@playwright/test";

const verse = (page: Page, label: string, translation = "cuv") =>
  page.locator(
    `[data-verse-text][data-translation="${translation}"][data-verse="${label}"]`,
  );
async function selectOption(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page
    .locator(".ant-select-dropdown")
    .getByText(option, { exact: true })
    .click();
}
const clipboard = (page: Page) =>
  page.evaluate(() => navigator.clipboard.readText());
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("verse-row clicks select full verses and Shift extends without replacing dragged text", async ({
  page,
}) => {
  await page.goto("/");
  const first = verse(page, "1");
  const firstText = await first.textContent();
  await first.click();
  await expect(first.locator("..")).toHaveClass(/is-selected/);
  await page.keyboard.press("Control+c");
  await expect
    .poll(() => clipboard(page))
    .toBe(`${firstText}\n— 创世记1:1·CUV`);
  await verse(page, "3").click({ modifiers: ["Shift"] });
  await expect(page.locator(".verse-cell.is-selected")).toHaveCount(3);
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toContain("创世记1:1–3·CUV");
  await page.getByRole("switch", { name: "多译本对照", exact: true }).click();
  await verse(page, "2", "webp").click();
  await expect(page.locator(".verse-cell.is-selected")).toHaveCount(1);
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toContain("·WEBP");

  await page.getByRole("switch", { name: "多译本对照", exact: true }).click();
  await first.scrollIntoViewIfNeeded();
  const bounds = await first.boundingBox();
  await page.mouse.move(bounds!.x + 1, bounds!.y + 8);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 57, bounds!.y + 8, { steps: 6 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected?.length).toBeGreaterThan(0);
  expect(selected!.length).toBeLessThan(firstText!.length);
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toBe(`${selected}\n— 创世记1:1·CUV`);
  await first.dblclick({ position: { x: 20, y: 8 } });
  const word = await page.evaluate(() => window.getSelection()?.toString());
  expect(word?.length).toBeGreaterThan(0);
  expect(word!.length).toBeLessThan(firstText!.length);
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toBe(`${word}\n— 创世记1:1·CUV`);
});

test("Chinese chapters and reference-only brackets persist and copy through the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-book="JHN"]').click();
  await page.getByRole("button", { name: "第3章", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await selectOption(page, "复制样式", "书卷简称");
  await selectOption(page, "章号数字", "中文数字（三）");
  await selectOption(page, "出处括号", "【】");
  await page.getByText("经文之前", { exact: true }).click();
  await expect(page.locator(".format-preview")).toContainText("【约三:1–2】");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await verse(page, "1").click();
  const text = await verse(page, "1").textContent();
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toBe(`【约三:1】\n${text}`);
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导出 PNG", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator(".ant-select").filter({
      has: page.getByRole("combobox", { name: "章号数字", exact: true }),
    }),
  ).toContainText("中文数字（三）");
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}"),
      ),
    )
    .toMatchObject({
      chapterNumerals: "chinese",
      referenceBrackets: "book",
      referencePosition: "before",
    });
  await page.reload();
  await verse(page, "1").click();
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toBe(`【约三:1】\n${text}`);
});

test("global typography scales UI and scripture, preserves PNG sizing and remains usable at minimum bounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/");
  const first = verse(page, "1");
  await expect(first).toBeVisible();
  const beforeVerse = await first.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  const beforeTitle = await page
    .locator("h1")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "全局字号", exact: true })
    .fill("20");
  await page
    .getByRole("spinbutton", { name: "全局字号", exact: true })
    .press("Tab");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect
    .poll(() =>
      first.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    )
    .toBeCloseTo((beforeVerse * 20) / 13, 1);
  expect(
    await page
      .locator("h1")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeCloseTo((beforeTitle * 20) / 13, 1);
  await page.locator('[data-book="PSA"]').click();
  await page.getByRole("button", { name: "第150章", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(verse(page, "1")).toBeInViewport();
  expect(
    await page
      .locator(".verse-scroll")
      .evaluate((element) => element.clientHeight),
  ).toBeGreaterThanOrEqual(120);
  await expect(
    page.getByRole("button", { name: "第150章", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Control+f");
  await expect(
    page.getByRole("searchbox", { name: "搜索条件", exact: true }),
  ).toBeInViewport();
  await expect(verse(page, "1")).toBeInViewport();
  expect(
    await page
      .locator(".verse-scroll")
      .evaluate((element) => element.clientHeight),
  ).toBeGreaterThanOrEqual(120);
  await expect(
    page.getByRole("button", { name: "第150章", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("global-font-minimum.png"),
    animations: "disabled",
  });
  await verse(page, "1").click();
  await page.getByRole("button", { name: "制作卡片", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导出 PNG", exact: true }),
  ).toBeEnabled();
  expect(await page.locator("canvas").getAttribute("width")).toBe("1080");
  expect(await page.locator("canvas").getAttribute("height")).toBe("1080");
  await page
    .getByRole("button", { name: "关闭卡片编辑器", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
            .globalFontSize,
      ),
    )
    .toBe(20);
  await page.reload();
  await expect
    .poll(() =>
      verse(page, "1").evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    )
    .toBeCloseTo((beforeVerse * 20) / 13, 1);
});

test("standard search, input copy/paste and quit commands preserve their contexts", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("h1").click();
  await page.keyboard.press("Control+f");
  const input = page.getByRole("searchbox", { name: "搜索条件", exact: true });
  await expect(input).toBeFocused();
  await input.fill("起%神");
  await page.keyboard.press("Control+f");
  expect(
    await input.evaluate(
      (element: HTMLInputElement) =>
        element.selectionEnd! - element.selectionStart!,
    ),
  ).toBe(3);
  await page.keyboard.press("Control+c");
  await expect.poll(() => clipboard(page)).toBe("起%神");
  await input.fill("");
  await page.keyboard.press("Control+v");
  await expect(input).toHaveValue("起%神");
  await input.press("Enter");
  await page
    .getByRole("button", { name: "前往创世记1:1", exact: true })
    .click();
  await verse(page, "1").click();
  await expect(
    page.getByRole("dialog", { name: "经文搜索", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Meta+f");
  await expect(input).toBeFocused();
  await input.press("Escape");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "全局字号", exact: true })
    .fill("17");
  await page.keyboard.press("Control+q");
  await expect(
    page.getByText("浏览器预览请直接关闭标签页", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
          .globalFontSize,
    ),
  ).toBe(17);
});
