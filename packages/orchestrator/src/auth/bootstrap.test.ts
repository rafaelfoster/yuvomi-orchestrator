import { describe, expect, it } from "vitest";
import { generateInitialPassword } from "./bootstrap.js";

describe("generateInitialPassword", () => {
  it("generates a password of at least 16 characters", () => {
    expect(generateInitialPassword().length).toBeGreaterThanOrEqual(16);
  });

  it("only contains URL-safe base64 characters (copy-paste friendly)", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateInitialPassword()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("never repeats across invocations", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateInitialPassword()));
    expect(seen.size).toBe(100);
  });
});
