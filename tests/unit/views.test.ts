import { test, expect } from "vitest";
import { createApp } from "@/app";

test("result view escapes untrusted user data", async () => {
  const app = createApp();
  const html = await new Promise<string>((resolve, reject) => app.render("showcase/user-info", {
    highlightedJson: "&lt;img src=x onerror=alert(1)&gt;",
    showExplanation: false,
    result: { client_title: "<script>alert(1)</script>", client_id: "client", state: "state", userInfo: { name: "<img src=x onerror=alert(1)>" } },
  }, (error: Error | null, html: string) => error ? reject(error) : resolve(html)));
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).not.toContain("<img src=x onerror=alert(1)>");
});
