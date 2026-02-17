import { describe, expect, it } from "vitest";
import {
  computePartState,
  isInTasks,
  type PartStateInputs,
} from "./partState.js";
import { asTimestamp } from "./core.js";
import { defaultSwedishProjectCalendar } from "./calendar.js";

const CAL = defaultSwedishProjectCalendar();

function ts(iso: string): ReturnType<typeof asTimestamp> {
  return asTimestamp(new Date(iso).getTime());
}

describe("computePartState", () => {
  it("approved => Approved", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: true,
      now: ts("2025-02-20T12:00:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Approved");
  });

  it("now < cutoff(endDate) => NotDue", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-16T23:59:59Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("NotDue");
  });

  it("now just before cutoff(endDate) => NotDue (no implicit midnight)", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-17T00:00:59Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("NotDue");
  });

  it("now at midnight on endDate => NotDue (cutoff is 00:01)", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-17T00:00:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("NotDue");
  });

  it("now at cutoff(endDate) => Due", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-17T00:01:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Due");
  });

  it("now within endDate day => Due", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-17T12:00:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Due");
  });

  it("now just before cutoff(endDate+1) => Due", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-18T00:00:59Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Due");
  });

  it("now at cutoff(endDate+1) => Overdue", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-18T00:01:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Overdue");
  });

  it("now well past endDate => Overdue", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      now: ts("2025-02-20T12:00:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Overdue");
  });

  it("notificationDate exists and now < cutoff(notificationDate) => Snoozed", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      notificationDate: "2025-02-20",
      now: ts("2025-02-18T12:00:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Snoozed");
  });

  it("notificationDate: now at cutoff(notificationDate) => Due when before endDate+1", () => {
    // endDate 2025-02-17, endDate+1 cutoff = 2025-02-18 00:01
    // notificationDate same as endDate; now at cutoff => past Snoozed, before Overdue
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      notificationDate: "2025-02-17",
      now: ts("2025-02-17T00:01:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Due");
  });

  it("notificationDate: now past cutoff(notificationDate) => Overdue when past endDate+1", () => {
    const inputs: PartStateInputs = {
      endDate: "2025-02-17",
      approved: false,
      notificationDate: "2025-02-20",
      now: ts("2025-02-21T00:01:00Z"),
      timezone: "UTC",
    };
    expect(computePartState(inputs, CAL)).toBe("Overdue");
  });
});

describe("isInTasks", () => {
  it("returns true for Due, Overdue, Snoozed", () => {
    expect(isInTasks("Due")).toBe(true);
    expect(isInTasks("Overdue")).toBe(true);
    expect(isInTasks("Snoozed")).toBe(true);
  });

  it("returns false for NotDue, Approved", () => {
    expect(isInTasks("NotDue")).toBe(false);
    expect(isInTasks("Approved")).toBe(false);
  });
});
