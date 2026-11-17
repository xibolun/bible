import { test, expect } from "@playwright/test";

test("holding arrow keys repeats across books and releasing stops navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "第49章", exact: true }).click();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.locator("h1").click();
  await page.keyboard.down("ArrowRight");
  for (const heading of [
    "创世记第 50 章",
    "出埃及记第 1 章",
    "出埃及记第 2 章",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".verse-scroll")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    if (heading !== "出埃及记第 2 章") await page.keyboard.down("ArrowRight");
  }
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "出埃及记第 1 章", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".verse-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.up("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 50 章", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await expect(
    page.getByRole("heading", { name: "创世记第 50 章", exact: true }),
  ).toBeVisible();
});

test("chapter buttons and shortcuts cross books and stop only at Bible ends", async ({
  page,
}) => {
  await page.goto("/");
  const previous = page.getByRole("button", { name: "上一章", exact: true });
  const next = page.getByRole("button", { name: "下一章", exact: true });
  await expect(previous).toBeDisabled();
  await page.getByRole("button", { name: "第50章", exact: true }).click();
  await next.click();
  await expect(
    page.getByRole("heading", { name: "出埃及记第 1 章", exact: true }),
  ).toBeVisible();
  await next.click();
  await expect(
    page.getByRole("heading", { name: "出埃及记第 2 章", exact: true }),
  ).toBeVisible();
  await previous.click();
  await previous.click();
  await expect(
    page.getByRole("heading", { name: "创世记第 50 章", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "第50章", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "出埃及记第 1 章", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "第1章", exact: true })
    .press("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 50 章", exact: true }),
  ).toBeVisible();
  await page.locator("h1").click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "出埃及记第 1 章", exact: true }),
  ).toBeVisible();
  await page.locator("h1").click();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 50 章", exact: true }),
  ).toBeVisible();
  await page.locator('[data-book="REV"]').click();
  await page.getByRole("button", { name: "第22章", exact: true }).click();
  await expect(next).toBeDisabled();
  await page.locator("h1").click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "启示录第 22 章", exact: true }),
  ).toBeVisible();
  await page.locator('[data-book="GEN"]').click();
  await expect(previous).toBeDisabled();
  await page.locator("h1").click();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("heading", { name: "创世记第 1 章", exact: true }),
  ).toBeVisible();
});
