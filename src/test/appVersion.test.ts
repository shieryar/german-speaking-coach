import { describe, expect, it } from "vitest";
import { APP_VERSION, formatAppVersion } from "@/lib/appVersion";

describe("app version", () => {
  it("shows the current deployed app version", () => {
    expect(APP_VERSION).toBe("1.1");
    expect(formatAppVersion()).toBe("Version 1.1");
  });
});
