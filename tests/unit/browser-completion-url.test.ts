import { expect, test } from "vitest";
import { completionUrlForAttempt } from "../../public/js/completion-url.js";

test("only accepts a same-origin completion URL for the exact state without credentials", () => {
  const origin = "https://showcase.example",
    state = "state-123";
  expect(
    completionUrlForAttempt("/auth/complete?state=state-123", origin, state),
  ).toBe("https://showcase.example/auth/complete?state=state-123");
  for (const url of [
    "https://user:pass@showcase.example/auth/complete?state=state-123",
    "https://evil.example/auth/complete?state=state-123",
    "/auth/complete?state=state-123&state=other",
    "/auth/complete?state=state-123#fragment",
    "/auth/complete?state=other",
  ]) {
    expect(completionUrlForAttempt(url, origin, state)).toBeUndefined();
  }
});
