import { test, expect, type Page } from "@playwright/test";
import { entry, setPassage } from "./projection-helpers";
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.keyboard.press("F8");
  await expect(entry(page, "book")).toBeFocused();
  return page.getByRole("dialog", { name: "经文投影 · F8", exact: true });
}
async function selected(
  page: Page,
  field: "book" | "chapter" | "start" | "end",
) {
  const input = entry(page, field);
  await expect(input).toBeFocused();
  await expect
    .poll(() =>
      input.evaluate((el) => {
        const input = el as HTMLInputElement;
        return (
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length
        );
      }),
    )
    .toBe(true);
}
test("one quick entry suggests books, commits the highlighted choice on Tab and projects a single verse with Enter", async ({
  page,
}) => {
  const panel = await open(page);
  await expect(panel.getByRole("tab")).toHaveCount(0);
  await expect(entry(page, "end")).toHaveCount(0);
  await entry(page, "book").pressSequentially("yuehan");
  await expect(
    page
      .locator(".ant-select-dropdown:visible")
      .getByText("约翰福音", { exact: true }),
  ).toBeVisible();
  await entry(page, "book").press("ArrowDown");
  await entry(page, "book").press("ArrowDown");
  await entry(page, "book").press("Tab");
  await selected(page, "chapter");
  await entry(page, "chapter").pressSequentially("3");
  await expect(entry(page, "chapter")).toHaveValue("3");
  await entry(page, "chapter").press("Tab");
  await selected(page, "start");
  await entry(page, "start").pressSequentially("16");
  await expect(entry(page, "start")).toHaveValue("16");
  const popup = page.waitForEvent("popup");
  await entry(page, "start").press("Enter");
  const audience = await popup;
  await expect(audience.locator(".projection-reference")).toContainText(
    "约一3:16",
  );
  await expect(entry(page, "end")).toHaveCount(0);
  await expect(
    panel.getByRole("region", { name: "投影清单", exact: true }),
  ).toHaveCount(0);
});
test("Tab reveals an optional end verse and selects values for replacement, including mouse and reverse focus", async ({
  page,
}) => {
  await open(page);
  let input = await setPassage(page, "PSA", "150", "1");
  await input.press("Shift+Tab");
  await selected(page, "chapter");
  await entry(page, "chapter").pressSequentially("3");
  await expect(entry(page, "chapter")).toHaveValue("3");
  await entry(page, "chapter").press("Tab");
  await selected(page, "start");
  await entry(page, "start").pressSequentially("1");
  await entry(page, "start").press("Tab");
  await selected(page, "end");
  await entry(page, "end").pressSequentially("6");
  const popup = page.waitForEvent("popup");
  await entry(page, "end").press("Enter");
  const audience = await popup;
  await expect(audience.locator(".projection-reference")).toContainText(
    "诗3:1–2",
  );
  input = await setPassage(page, "GEN", "3", "15");
  await input.press("Tab");
  await selected(page, "end");
  await expect(entry(page, "end")).toHaveValue("15");
  await entry(page, "end").pressSequentially("16");
  await expect(entry(page, "end")).toHaveValue("16");
  await entry(page, "end").press("Enter");
  await expect(audience.locator(".projection-reference")).toContainText(
    "创3:15–16",
  );
  await entry(page, "start").click({ position: { x: 8, y: 12 } });
  await selected(page, "start");
  await entry(page, "start").press("Enter");
  await expect(audience.locator(".projection-reference")).toContainText(
    "创3:15",
  );
  await expect(audience.locator(".projection-reference")).not.toContainText(
    "–",
  );
  await expect(entry(page, "end")).toHaveCount(0);
  await entry(page, "start").click({ position: { x: 8, y: 12 } });
  await selected(page, "start");
  await entry(page, "start").pressSequentially("14");
  await expect(entry(page, "end")).toHaveCount(0);
  await entry(page, "start").press("Enter");
  await expect(audience.locator(".projection-reference")).toContainText(
    "创3:14",
  );
});
test("Control Enter, Meta Enter and Add prepare the same list without projecting and refocus the book", async ({
  page,
}) => {
  const panel = await open(page);
  let input = await setPassage(page, "John", "3", "16");
  await input.press("Control+Enter");
  const list = panel.getByRole("region", { name: "投影清单", exact: true });
  await expect(list.locator("li > span")).toHaveText(["JHN3:16"]);
  await selected(page, "book");
  input = await setPassage(page, "csj", "1", "1");
  await input.press("Meta+Enter");
  await expect(list.locator("li > span")).toHaveText(["JHN3:16", "GEN1:1"]);
  await selected(page, "book");
  await panel
    .getByRole("button", { name: "加入投影清单", exact: true })
    .click();
  await expect(list.locator("li > span")).toHaveText([
    "JHN3:16",
    "GEN1:1",
    "GEN1:1",
  ]);
  expect(page.context().pages()).toHaveLength(1);
  await selected(page, "book");
  const popup = page.waitForEvent("popup");
  await list.getByRole("button", { name: "投放清单", exact: true }).click();
  const audience = await popup;
  await expect(audience.locator(".projection-passage")).toHaveCount(3);
});
test("composition and repeated Enter do not publish or add passages", async ({
  page,
}) => {
  const panel = await open(page);
  const input = await setPassage(page, "GEN", "1", "1");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    repeat: true,
  });
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    ctrlKey: true,
    isComposing: true,
  });
  await expect(
    panel.getByRole("region", { name: "投影清单", exact: true }),
  ).toHaveCount(0);
  expect(page.context().pages()).toHaveLength(1);
  const popup = page.waitForEvent("popup");
  await input.press("Enter");
  await expect((await popup).locator(".projection-reference")).toContainText(
    "创1:1",
  );
});
