import { describe, expect, it } from "vitest";
import { addDuration, compareTimestamps, now } from "./utils.js";
import { asDuration, asTimestamp } from "./core.js";

describe("now()", () => {
  it("returns increasing timestamps", () => {
    const t1 = now();
    const t2 = now();
    expect(t2).toBeGreaterThanOrEqual(t1);
  });
});

describe("addDuration()", () => {
  it("adds correctly", () => {
    const ts = asTimestamp(1000);
    const d = asDuration(500);
    expect(addDuration(ts, d)).toBe(1500);
  });
});

describe("compareTimestamps()", () => {
  it("ordering works", () => {
    const a = asTimestamp(100);
    const b = asTimestamp(200);
    const c = asTimestamp(100);

    expect(compareTimestamps(a, b)).toBeLessThan(0);
    expect(compareTimestamps(b, a)).toBeGreaterThan(0);
    expect(compareTimestamps(a, c)).toBe(0);
  });
});
