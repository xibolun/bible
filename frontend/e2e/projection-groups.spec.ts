import { expect, test, type Page } from "@playwright/test";
import { entry, setPassage, addPassage } from "./projection-helpers";

async function open(page: Page) {
  await page.goto("/");
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
  return panel;
}
async function pageSize(page: Page, value: string) {
  await page
    .getByRole("combobox", { name: "每段每页经节", exact: true })
    .click();
  await page
    .locator(".ant-select-dropdown:visible")
    .locator(".ant-select-item-option-content")
    .filter({ hasText: new RegExp("^" + value + "$") })
    .click();
}
test("searchable dropdowns prepare, reorder and remove passages from different books without changing the audience until publication", async ({
  page,
  context,
}) => {
  const panel = await open(page);
  await addPassage(page, "csj", "3", "15", "16");
  await addPassage(page, "yuehan", "3", "16");
  const list = panel.getByRole("region", { name: "投影清单", exact: true });
  await expect(list.locator("li > span")).toHaveText(["GEN3:15-16", "JHN3:16"]);
  await list.getByRole("button", { name: "上移第2段", exact: true }).click();
  await expect(list.locator("li > span")).toHaveText(["JHN3:16", "GEN3:15-16"]);
  await list.getByRole("button", { name: "移除第1段", exact: true }).click();
  await panel
    .getByRole("button", { name: "加入投影清单", exact: true })
    .click();
  await expect(list.locator("li > span")).toHaveText(["GEN3:15-16", "JHN3:16"]);
  const popup = page.waitForEvent("popup");
  await list.getByRole("button", { name: "投放清单", exact: true }).click();
  const audience = await popup;
  await expect(audience.locator(".projection-passage")).toHaveCount(2);
  await expect(audience.locator(".projection-reference").nth(0)).toContainText(
    "创3:15–16",
  );
  await expect(audience.locator(".projection-reference").nth(1)).toContainText(
    "约3:16",
  );
  await expect(audience.locator(".projection-verses").nth(1)).toContainText(
    "神爱世人",
  );
  await context.setOffline(true);
  await list.getByRole("button", { name: "移除第2段", exact: true }).click();
  await expect(audience.locator(".projection-passage")).toHaveCount(2);
  await pageSize(page, "1");
  await expect(
    panel.getByRole("button", { name: "下一页", exact: true }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(audience.locator(".projection-passage")).toHaveCount(1);
  await expect(audience.locator(".projection-reference")).toContainText(
    "创3:16",
  );
  await expect(
    panel.getByRole("button", { name: "下一页", exact: true }),
  ).toBeDisabled();
  const before = await audience.locator(".projection-content").textContent();
  const input = await setPassage(page, "GEN", "3", "16", "15");
  await input.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("无效");
  await expect(audience.locator(".projection-content")).toHaveText(before!);
  await list.getByRole("button", { name: "清空清单", exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(audience.locator(".projection-content")).toHaveText(before!);
});

test("compact unlabeled passage row supports English and Pinyin at minimum bounds with large typography", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "bible:mock:preferences",
      JSON.stringify({ globalFontSize: 20 }),
    );
  });
  await page.setViewportSize({ width: 1024, height: 640 });
  const panel = await open(page);
  const row = panel.getByRole("group", { name: "快速经文", exact: true });
  await expect(row.locator("label")).toHaveCount(0);
  for (const [query, name] of [
    ["John", "约翰福音"],
    ["yuē hàn", "约翰福音"],
    ["yhfy", "约翰福音"],
    ["1 John", "约翰一书"],
    ["tie sa luo ni jia qian shu", "帖撒罗尼迦前书"],
  ]) {
    await entry(page, "book").fill(query);
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText(name, { exact: true })
      .click();
  }
  await setPassage(page, "1TH", "3", "5", "6");
  const controls = row.locator(".ant-select,button");
  await expect(controls).toHaveCount(6);
  const bounds = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const r = element.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
      };
    }),
  );
  for (const boundsItem of bounds) {
    expect(Math.abs(boundsItem.top - bounds[0].top)).toBeLessThan(2);
    expect(boundsItem.width).toBeGreaterThan(25);
  }
  const group = await row.boundingBox();
  expect(bounds[0].left).toBeGreaterThanOrEqual(group!.x - 1);
  expect(bounds.at(-1)!.right).toBeLessThanOrEqual(group!.x + group!.width + 1);
  const fits = await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  await row.getByRole("button", { name: "加入投影清单", exact: true }).click();
  await expect(
    panel.getByRole("region", { name: "投影清单", exact: true }),
  ).toContainText("1TH3:5-6");
  await row.screenshot({
    path: test.info().outputPath("compact-projection-reference-row.png"),
  });
});

test("prepared passages retain both citations and grouped long text fits a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  const panel = await open(page);
  await addPassage(page, "GEN", "3", "15", "16");
  await addPassage(page, "JHN", "3", "16");
  const list = panel.getByRole("region", { name: "投影清单", exact: true });
  const popup = page.waitForEvent("popup");
  await list.getByRole("button", { name: "投放清单", exact: true }).click();
  const audience = await popup;
  await audience.setViewportSize({ width: 640, height: 360 });
  await expect(audience.locator(".projection-reference")).toHaveCount(2);
  await pageSize(page, "6");
  await list.getByRole("button", { name: "清空清单", exact: true }).click();
  for (const [book, ch, start, end] of [
    ["GEN", "3", "15", "20"],
    ["PSA", "119", "1", "6"],
    ["JHN", "3", "16", "21"],
  ])
    await addPassage(page, book, ch, start, end);
  await list.getByRole("button", { name: "投放清单", exact: true }).click();
  await expect(audience.locator(".projection-reference")).toHaveCount(3);
  await expect(audience.locator(".projection-reference").nth(2)).toContainText(
    "约3:16–21",
  );
  for (const surface of [page, audience]) {
    await expect
      .poll(() =>
        surface.locator(".projection-content").evaluate((el) => {
          const content = el.getBoundingClientRect(),
            board = el.parentElement!.getBoundingClientRect();
          return (
            content.top >= board.top &&
            content.bottom <= board.bottom + 1 &&
            el.scrollWidth <= board.width + 1
          );
        }),
      )
      .toBe(true);
  }
  await audience.screenshot({
    path: test.info().outputPath("projection-multiple-books.png"),
  });
  for (let n = 0; n < 3; n++)
    for (const [book, ch, start, end] of [
      ["GEN", "3", "15", "20"],
      ["PSA", "119", "1", "6"],
      ["JHN", "3", "16", "21"],
    ])
      await addPassage(page, book, ch, start, end);
  await list.getByRole("button", { name: "投放清单", exact: true }).click();
  await expect(audience.locator(".projection-passage")).toHaveCount(12);
  await expect
    .poll(() =>
      audience.locator(".projection-content").evaluate((el) => {
        const content = el.getBoundingClientRect(),
          board = el.parentElement!.getBoundingClientRect();
        return (
          content.top >= board.top &&
          content.bottom <= board.bottom + 1 &&
          el.scrollWidth <= board.width + 1
        );
      }),
    )
    .toBe(true);
});

test("themes update the audience live, preserve citation settings and font size, and retain legacy custom colors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("bible:mock:preferences"))
      localStorage.setItem(
        "bible:mock:preferences",
        JSON.stringify({
          projectionStyle: {
            backgroundColor: "#123456",
            textColor: "#ffffff",
            fontSize: 100,
            referenceBrackets: "book",
          },
        }),
      );
  });
  const panel = await open(page);
  await expect(panel.getByLabel("背景颜色", { exact: true })).toHaveValue(
    "#123456",
  );
  await addPassage(page, "JHN", "3", "16");
  await addPassage(page, "GEN", "1", "1");
  const popup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "投放清单", exact: true }).click();
  const audience = await popup;
  await expect(audience.locator(".projection-board")).toHaveAttribute(
    "data-theme",
    "custom",
  );
  for (const [name, id, color] of [
    ["白板", "whiteboard", "rgb(255, 255, 255)"],
    ["夜空", "midnight", "rgb(16, 24, 32)"],
    ["暖纸", "paper", "rgb(244, 237, 220)"],
    ["青绿", "sage", "rgb(228, 237, 229)"],
    ["深蓝", "navy", "rgb(16, 43, 70)"],
    ["暮紫", "plum", "rgb(48, 43, 64)"],
  ]) {
    await panel
      .getByRole("button", { name: name + "主题", exact: true })
      .click();
    await expect(audience.locator(".projection-board")).toHaveAttribute(
      "data-theme",
      id,
    );
    await expect(audience.locator(".projection-board")).toHaveCSS(
      "background-color",
      color,
    );
    await expect(
      panel.getByRole("spinbutton", { name: "投影字号", exact: true }),
    ).toHaveValue("100");
    await expect(
      audience.locator(".projection-reference").first(),
    ).toContainText("【约3:16·CUV】");
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("bible:mock:preferences") || "{}")
            .projectionStyle?.themeId,
      ),
    )
    .toBe("plum");
  await panel.getByRole("group", { name: "主题预览", exact: true }).screenshot({
    path: test.info().outputPath("projection-theme-choices.png"),
  });
  await page.reload();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.keyboard.press("F8");
  const reopened = page.getByRole("dialog", {
    name: "经文投影 · F8",
    exact: true,
  });
  await expect(
    reopened.getByRole("button", { name: "暮紫主题", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(reopened.getByLabel("背景颜色", { exact: true })).toHaveValue(
    "#302b40",
  );
});
