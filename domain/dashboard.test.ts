import { describe, expect, it } from "vitest";
import {
  taskList,
  qualityList,
  anomalyList,
  type Part,
  type QualityItem,
  type Anomaly,
} from "./dashboard.js";
import type { PartLifecycleEvent } from "./events.js";
import { asTimestamp } from "./core.js";
import { defaultSwedishProjectCalendar } from "./calendar.js";

const CAL = defaultSwedishProjectCalendar();

/** Timestamp for 2025-02-18 12:00:00 UTC (past cutoff for 2025-02-17 and 2025-02-18). */
const NOW_UTC = asTimestamp(new Date("2025-02-18T12:00:00Z").getTime());
const TS = asTimestamp(new Date("2025-02-01T12:00:00Z").getTime());

describe("taskList", () => {
  it("orders by status (ActionRequired first), then endDate asc, then partId", () => {
    const parts: Part[] = [
      { partId: "B", endDate: "2025-02-18" },
      { partId: "A", endDate: "2025-02-17" },
      { partId: "C", endDate: "2025-02-15" },
      { partId: "D", endDate: "2025-02-18" },
      { partId: "E", endDate: "2025-02-16" },
    ];
    const events = [
      {
        type: "PartSnoozed" as const,
        partId: "C",
        notificationDate: "2025-02-25",
        timestamp: TS,
        version: 0,
      },
      {
        type: "PartSnoozed" as const,
        partId: "E",
        notificationDate: "2025-02-26",
        timestamp: TS,
        version: 0,
      },
    ];
    const result = taskList(parts, events, NOW_UTC, "UTC", CAL);
    expect(result).toHaveLength(5);
    // ActionRequired first: A (17), B (18), D (18) — by endDate asc, then partId
    expect(result[0]).toMatchObject({ partId: "A", status: "ActionRequired", endDate: "2025-02-17" });
    expect(result[1]).toMatchObject({ partId: "B", status: "ActionRequired", endDate: "2025-02-18" });
    expect(result[2]).toMatchObject({ partId: "D", status: "ActionRequired", endDate: "2025-02-18" });
    // Snoozed: C (15), E (16) — by endDate asc
    expect(result[3]).toMatchObject({ partId: "C", status: "Snoozed", endDate: "2025-02-15" });
    expect(result[4]).toMatchObject({ partId: "E", status: "Snoozed", endDate: "2025-02-16" });
  });

  it("sets overdue when now >= cutoff(endDate + 1 day)", () => {
    const parts: Part[] = [
      { partId: "X", endDate: "2025-02-17" },
      { partId: "Y", endDate: "2025-02-18" },
    ];
    const events: PartLifecycleEvent[] = [];
    const result = taskList(parts, events, NOW_UTC, "UTC", CAL);
    expect(result[0]).toMatchObject({ partId: "X", overdue: true });
    expect(result[1]).toMatchObject({ partId: "Y", overdue: false });
  });

  it("excludes approved parts and parts before cutoff(endDate)", () => {
    const parts: Part[] = [
      { partId: "P1", endDate: "2025-02-20" },
      { partId: "P2", endDate: "2025-02-19" },
    ];
    const events = [
      {
        type: "PartApproved" as const,
        partId: "P1",
        timestamp: asTimestamp(new Date("2025-02-15T12:00:00Z").getTime()),
        version: 0,
      },
    ];
    const beforeCutoff = asTimestamp(new Date("2025-02-19T00:00:00Z").getTime());
    const result = taskList(parts, events, beforeCutoff, "UTC", CAL);
    expect(result).toHaveLength(0);
  });
});

describe("qualityList", () => {
  it("orders by dueDate asc, then state (Ongoing first), then startDate asc, then partId", () => {
    const items: QualityItem[] = [
      { id: "1", partId: "Z", state: "Done", startDate: "2025-02-10", dueDate: "2025-02-20" },
      { id: "2", partId: "A", state: "Ongoing", startDate: "2025-02-15", dueDate: "2025-02-20" },
      { id: "3", partId: "B", state: "NotStarted", startDate: "2025-02-10", dueDate: "2025-02-20" },
      { id: "4", partId: "C", state: "Ongoing", startDate: "2025-02-12", dueDate: "2025-02-18" },
      { id: "5", partId: "D", state: "NotStarted", startDate: "2025-02-11", dueDate: "2025-02-18" },
    ];
    const result = qualityList(items);
    expect(result[0]).toMatchObject({ partId: "C", dueDate: "2025-02-18", state: "Ongoing" });
    expect(result[1]).toMatchObject({ partId: "D", dueDate: "2025-02-18", state: "NotStarted" });
    expect(result[2]).toMatchObject({ partId: "A", dueDate: "2025-02-20", state: "Ongoing" });
    expect(result[3]).toMatchObject({ partId: "B", dueDate: "2025-02-20", state: "NotStarted" });
    expect(result[4]).toMatchObject({ partId: "Z", dueDate: "2025-02-20", state: "Done" });
  });
});

describe("anomalyList", () => {
  it("excludes Resolved and orders by createdAt asc, then partId", () => {
    const anomalies: Anomaly[] = [
      { id: "1", partId: "B", createdAt: 200, state: "Open", priority: 1 },
      { id: "2", partId: "A", createdAt: 100, state: "Resolved", priority: 1 },
      { id: "3", partId: "C", createdAt: 200, state: "Ongoing", priority: 2 },
      { id: "4", partId: "D", createdAt: 150, state: "Open", priority: 3 },
      { id: "5", partId: "E", createdAt: 50, state: "Ongoing", priority: 1 },
    ];
    const result = anomalyList(anomalies);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ partId: "E", createdAt: 50 });
    expect(result[1]).toMatchObject({ partId: "D", createdAt: 150 });
    expect(result[2]).toMatchObject({ partId: "B", createdAt: 200 });
    expect(result[3]).toMatchObject({ partId: "C", createdAt: 200 });
  });
});
