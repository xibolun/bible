import { expect, test, type Page } from "@playwright/test";

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
async function number(page: Page, label: string, value: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await expect(input).toBeEnabled();
  await input.fill(value);
  await input.press("Enter");
}
async function book(page: Page, query: string, name: string) {
  const input = page.getByRole("combobox", { name: "投影书卷", exact: true });
  await input.fill(query);
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(name, { exact: true })
    .click();
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
  await panel.getByRole("tab", { name: "下拉选择", exact: true }).click();
  await book(page, "创", "创世记");
  await number(page, "投影章节", "３");
  await number(page, "投影起始节", "15");
  await number(page, "投影结束节", "16");
  await panel
    .getByRole("button", { name: "加入投影清单", exact: true })
    .click();
  await book(page, "Ｊｏｈｎ", "约翰福音");
  await number(page, "投影章节", "3");
  await number(page, "投影起始节", "16");
  await panel
    .getByRole("button", { name: "加入投影清单", exact: true })
    .click();
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
  await panel.getByRole("tab", { name: "快速输入", exact: true }).click();
  const input = panel.getByRole("searchbox", { name: "投影经文", exact: true });
  await input.fill("GEN3:15;JHN99:16");
  await input.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("无效");
  await expect(audience.locator(".projection-content")).toHaveText(before!);
  await list.getByRole("button", { name: "清空清单", exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(audience.locator(".projection-content")).toHaveText(before!);
});

test("quick compound references retain both citations and grouped long text fits a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  const panel = await open(page);
  const input = panel.getByRole("searchbox", { name: "投影经文", exact: true });
  await input.fill("创３:１５-１６＋约３:１６");
  const popup = page.waitForEvent("popup");
  await input.press("Enter");
  const audience = await popup;
  await audience.setViewportSize({ width: 640, height: 360 });
  await expect(audience.locator(".projection-reference")).toHaveCount(2);
  await pageSize(page, "6");
  await input.fill("GEN3:15-20;PSA119:1-6;JHN3:16-21");
  await input.press("Enter");
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
  await input.fill(Array(4).fill("GEN3:15-20;PSA119:1-6;JHN3:16-21").join(";"));
  await input.press("Enter");
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
  const input = panel.getByRole("searchbox", { name: "投影经文", exact: true });
  await input.fill("JHN3:16;GEN1:1");
  const popup = page.waitForEvent("popup");
  await input.press("Enter");
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
