import { test, expect, type Page } from "@playwright/test";

async function controls(page: Page) {
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.keyboard.press("F8");
  const panel = page.getByRole("dialog", {
    name: "经文投影 · F8",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("searchbox", { name: "投影经文", exact: true }),
  ).toBeFocused();
  return panel;
}
async function choose(page: Page, label: string, text: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(text, { exact: true })
    .click();
}
test("F8 projects full-width references offline in a separate audience window, retains invalid content and closes cleanly", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const panel = await controls(page);
  const input = panel.getByRole("searchbox", { name: "投影经文", exact: true });
  await input.fill("创３：１５－１６");
  const popup = page.waitForEvent("popup");
  await input.press("Enter");
  const audience = await popup;
  await expect(audience.locator(".projection-reference")).toContainText(
    "创3:15–16",
  );
  await expect(audience.locator(".projection-verses")).toContainText(
    "彼此为仇",
  );
  await expect(audience.locator(".projection-verses")).toContainText(
    "生产儿女",
  );
  await context.setOffline(true);
  await expect(audience.getByRole("button")).toHaveCount(0);
  await expect(panel).toBeVisible();
  const before = await audience.locator(".projection-content").textContent();
  await input.fill("创3:16-15");
  await input.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("无效");
  await expect(audience.locator(".projection-content")).toHaveText(before!);
  await page.keyboard.press("F8");
  await expect(input).toBeFocused();
  await expect(input).toHaveJSProperty("selectionStart", 0);
  await panel.getByRole("button", { name: "停止投影", exact: true }).click();
  await expect.poll(() => audience.isClosed()).toBe(true);
  await context.setOffline(false); // A new browser document still needs the local preview server.
  await input.fill("GEN1:1");
  const second = page.waitForEvent("popup");
  await input.press("Enter");
  const reopened = await second;
  await expect(reopened.locator(".projection-verses")).toContainText("起初");
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => reopened.isClosed()).toBe(true);
});

test("projection styles update live, paging and blanking synchronize in both directions and preferences persist", async ({
  page,
}) => {
  await page.goto("/");
  const panel = await controls(page);
  const input = panel.getByRole("searchbox", { name: "投影经文", exact: true });
  await input.fill("诗150");
  const popup = page.waitForEvent("popup");
  await input.press("Enter");
  const audience = await popup;
  await expect(audience.locator(".projection-reference")).toContainText(
    "诗150:1–2",
  );
  await panel.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(audience.locator(".projection-reference")).toContainText(
    "诗150:3–4",
  );
  await audience.keyboard.press("ArrowRight");
  await expect(audience.locator(".projection-reference")).toContainText(
    "诗150:5–6",
  );
  await expect(
    panel.getByRole("button", { name: "下一页", exact: true }),
  ).toBeDisabled();
  await audience.keyboard.press("ArrowRight");
  await expect(audience.locator(".projection-reference")).toContainText(
    "诗150:5–6",
  );
  await audience.keyboard.press("b");
  await expect(audience.locator(".projection-board")).toHaveAttribute(
    "data-blank",
    "true",
  );
  await expect(audience.locator(".projection-content")).toHaveCount(0);
  await panel.getByRole("button", { name: "恢复画面", exact: true }).click();
  await expect(audience.locator(".projection-reference")).toBeVisible();
  await choose(page, "投影主题", "暖纸");
  await expect(audience.locator(".projection-board")).toHaveCSS(
    "background-color",
    "rgb(244, 237, 220)",
  );
  await panel
    .getByRole("spinbutton", { name: "投影字号", exact: true })
    .fill("100");
  await choose(page, "章号数字", "中文数字（三）");
  await choose(page, "出处括号", "【】");
  await choose(page, "投影经文样式", "书卷简称");
  await expect(audience.locator(".projection-reference")).toHaveText(
    "— 【诗一百五十:5–6】",
  );
  await audience.keyboard.press("F8");
  await expect(input).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
            .projectionStyle?.fontSize,
      ),
    )
    .toBe(100);
  await page.reload();
  const reopened = await controls(page);
  await expect(
    reopened.getByRole("spinbutton", { name: "投影字号", exact: true }),
  ).toHaveValue("100");
  await expect(reopened.getByLabel("背景颜色", { exact: true })).toHaveValue(
    "#f4eddc",
  );
});

test("long pages fit the audience and preview at small viewports without clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/");
  const panel = await controls(page);
  await choose(page, "每页经节", "6");
  await panel
    .getByRole("spinbutton", { name: "投影字号", exact: true })
    .fill("120");
  await expect(
    panel.getByRole("button", { name: "投放", exact: true }),
  ).toBeEnabled();
  await panel
    .getByRole("searchbox", { name: "投影经文", exact: true })
    .fill("诗119:1-6");
  const popup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "投放", exact: true }).click();
  const audience = await popup;
  await audience.setViewportSize({ width: 640, height: 360 });
  await expect(audience.locator(".projection-reference")).toContainText(
    "诗119:1–6",
  );
  for (const surface of [audience, page]) {
    await expect
      .poll(() =>
        surface.locator(".projection-content").evaluate((el) => {
          const content = el.getBoundingClientRect(),
            board = el.parentElement!.getBoundingClientRect();
          return (
            content.top >= board.top &&
            content.bottom <= board.bottom + 1 &&
            el.scrollWidth <= board.width
          );
        }),
      )
      .toBe(true);
  }
  await audience.screenshot({
    path: test.info().outputPath("projection-small-long.png"),
  });
  // Fractional preview widths must not force every passage down to the minimum font.
  await expect
    .poll(async () => {
      const measure = (surface: Page) =>
        surface
          .locator(".projection-content")
          .evaluate(
            (el) =>
              parseFloat(getComputedStyle(el).fontSize) /
              el.parentElement!.clientWidth,
          );
      const ratio = (await measure(page)) / (await measure(audience));
      return ratio > 0.85 && ratio < 1.15;
    })
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("projection-controller.png"),
  });
});
