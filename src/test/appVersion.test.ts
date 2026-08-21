import { describe, expect, it } from "vitest";
import { APP_VERSION, formatAppVersion } from "@/lib/appVersion";

describe("app version", () => {
  it("starts visible app versioning at 0.1", () => {
    expect(APP_VERSION).toBe("0.1");
    expect(formatAppVersion()).toBe("Version 0.1");
  });
});
