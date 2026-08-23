import { describe, expect, it } from "vitest";
import { APP_VERSION, formatAppVersion } from "@/lib/appVersion";

describe("app version", () => {
  it("shows the current deployed app version", () => {
    expect(APP_VERSION).toBe("0.8");
    expect(formatAppVersion()).toBe("Version 0.8");
  });
});
