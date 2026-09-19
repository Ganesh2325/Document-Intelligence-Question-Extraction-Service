import { expect, test } from "@playwright/test";

test("recruiter can sign in and open the workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("recruiter@folio.dev");
  await page.getByLabel("Password").fill("RecruiterDemo123!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("heading", { name: "Document intelligence" })).toBeVisible();
  await page.getByRole("link", { name: "Documents" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
});
