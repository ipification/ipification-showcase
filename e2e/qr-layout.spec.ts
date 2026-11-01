import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 400, height: 483 },
  { width: 667, height: 320 },
  { width: 1440, height: 1000 },
]) {
  test(`QR content stays separated and scrollable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    // Open the desktop QR flow before resizing; mobile direct auth stays unchanged.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/auth/login#login");
    await page.getByRole("button", { name: "IP", exact: true }).click();
    await expect(page.getByTestId("qr-auth-link")).toHaveAttribute(
      "href",
      /qrcode/,
    );
    await page.setViewportSize(viewport);
    const dialog = page.getByRole("dialog");
    await expect(async () => {
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(15);
      expect(bounds!.y).toBeGreaterThanOrEqual(15);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        viewport.width - 15,
      );
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        viewport.height - 15,
      );
    }).toPass({ timeout: 2000 });
    // QR and instructions must never overlap, in stacked or landscape layouts.
    const qr = await dialog.locator(".legacy-qr-content svg").boundingBox();
    const caption = await dialog.locator(".legacy-qr-caption").boundingBox();
    expect(
      qr!.y + qr!.height + 16 <= caption!.y ||
        qr!.x + qr!.width + 16 <= caption!.x,
    ).toBe(true);
    await dialog.getByText(/Expires in/).scrollIntoViewIfNeeded();
    await expect(dialog.getByText(/Expires in/)).toBeInViewport();
    await page.screenshot({
      path: `test-results/qr-layout-${viewport.width}x${viewport.height}.png`,
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
