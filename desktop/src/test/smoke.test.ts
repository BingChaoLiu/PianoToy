import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("happy-dom is configured", () => {
    document.body.innerHTML = '<div id="x">hello</div>';
    const el = document.getElementById("x");
    expect(el?.textContent).toBe("hello");
  });
});