/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("mobile practice menu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens the hidden practice options and lets the user change them", () => {
    render(<Home />);

    expect(screen.queryByRole("dialog", { name: "Practice menu" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open practice menu" }));

    const menu = screen.getByRole("dialog", { name: "Practice menu" });
    const mode = within(menu).getByLabelText("Mode");
    const scenario = within(menu).getByLabelText("Scenario");

    expect((mode as HTMLSelectElement).value).toBe("conversation");
    expect((scenario as HTMLSelectElement).value).toBe("job-interview");
    fireEvent.change(mode, { target: { value: "strict" } });
    expect((mode as HTMLSelectElement).value).toBe("strict");
    expect(within(menu).getByRole("heading", { name: "Saved progress" })).toBeTruthy();
    expect(within(menu).getByRole("heading", { name: "Recent practice" })).toBeTruthy();
  });

  it("closes from the menu close button", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Open practice menu" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Practice menu" })).getByRole("button", { name: "Close practice menu" }));

    expect(screen.queryByRole("dialog", { name: "Practice menu" })).toBeNull();
  });
});
