import { describe, expect, it } from "vitest";
import {
  isWorkingDay,
  nextWorkingDay,
  addWorkingDays,
  diffWorkingDays,
  type WorkingDayConfig,
} from "./workingDays.js";

const DEFAULT: WorkingDayConfig = { workdays: [1, 2, 3, 4, 5] };

describe("isWorkingDay", () => {
  it("weekend skip — Sat/Sun non-working by default", () => {
    // 2025-02-15 = Saturday, 2025-02-16 = Sunday
    expect(isWorkingDay("2025-02-15", DEFAULT)).toBe(false);
    expect(isWorkingDay("2025-02-16", DEFAULT)).toBe(false);
  });

  it("weekday working by default", () => {
    // 2025-02-17 = Monday
    expect(isWorkingDay("2025-02-17", DEFAULT)).toBe(true);
    expect(isWorkingDay("2025-02-18", DEFAULT)).toBe(true);
  });

  it("holiday skip — holidays always non-working", () => {
    const config: WorkingDayConfig = {
      workdays: [1, 2, 3, 4, 5],
      holidays: ["2025-02-17"],
    };
    expect(isWorkingDay("2025-02-17", config)).toBe(false);
  });
});

describe("nextWorkingDay", () => {
  it("returns same date if working", () => {
    expect(nextWorkingDay("2025-02-17", DEFAULT)).toBe("2025-02-17");
  });

  it("skips weekend", () => {
    expect(nextWorkingDay("2025-02-15", DEFAULT)).toBe("2025-02-17"); // Sat -> Mon
    expect(nextWorkingDay("2025-02-16", DEFAULT)).toBe("2025-02-17"); // Sun -> Mon
  });

  it("skips holidays", () => {
    const config: WorkingDayConfig = {
      workdays: [1, 2, 3, 4, 5],
      holidays: ["2025-02-17"],
    };
    expect(nextWorkingDay("2025-02-16", config)).toBe("2025-02-18"); // Sun -> skip Mon (holiday) -> Tue
  });
});

describe("addWorkingDays", () => {
  it("amount=0 → same date if working else next working", () => {
    expect(addWorkingDays("2025-02-17", 0, DEFAULT)).toBe("2025-02-17");
    expect(addWorkingDays("2025-02-15", 0, DEFAULT)).toBe("2025-02-17"); // Sat -> Mon
  });

  it("addWorkingDays across weekends", () => {
    // Fri 2025-02-14 + 1 = Mon 2025-02-17
    expect(addWorkingDays("2025-02-14", 1, DEFAULT)).toBe("2025-02-17");
    // Fri 2025-02-14 + 3 = Wed 2025-02-19
    expect(addWorkingDays("2025-02-14", 3, DEFAULT)).toBe("2025-02-19");
  });

  it("negative amount goes backward", () => {
    // Mon 2025-02-17 - 1 = Fri 2025-02-14
    expect(addWorkingDays("2025-02-17", -1, DEFAULT)).toBe("2025-02-14");
  });
});

describe("diffWorkingDays", () => {
  it("same date => 0", () => {
    expect(diffWorkingDays("2025-02-17", "2025-02-17", DEFAULT)).toBe(0);
  });

  it("Mon to Tue => 1", () => {
    expect(diffWorkingDays("2025-02-17", "2025-02-18", DEFAULT)).toBe(1);
  });

  it("Mon to Wed => 2", () => {
    expect(diffWorkingDays("2025-02-17", "2025-02-19", DEFAULT)).toBe(2);
  });

  it("Fri to Mon (next week) => 1", () => {
    expect(diffWorkingDays("2025-02-14", "2025-02-17", DEFAULT)).toBe(1);
  });

  it("sign-aware: to < from => negative", () => {
    expect(diffWorkingDays("2025-02-19", "2025-02-17", DEFAULT)).toBe(-2);
  });

  it("diff symmetry: addWorkingDays(date, N) then diff = N", () => {
    const date = "2025-02-17";
    const plus3 = addWorkingDays(date, 3, DEFAULT);
    expect(diffWorkingDays(date, plus3, DEFAULT)).toBe(3);
  });

  it("diff symmetry: addWorkingDays(date, -N) then diff = -N", () => {
    const date = "2025-02-19";
    const minus2 = addWorkingDays(date, -2, DEFAULT);
    expect(diffWorkingDays(date, minus2, DEFAULT)).toBe(-2);
  });
});
