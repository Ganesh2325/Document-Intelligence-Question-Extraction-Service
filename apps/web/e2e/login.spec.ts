import { expect, test } from "@playwright/test";

test("recruiter can sign in with prefilled credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("recruiter@folio.dev").first()).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("recruiter@folio.dev");
  await expect(page.getByLabel("Password")).toHaveValue("RecruiterDemo123!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("heading", { name: "Document intelligence" })).toBeVisible();
  await page.getByRole("link", { name: "Documents" }).click();
  await expect(page.getByText("No documents yet")).toBeVisible();
});
