import { describe, expect, it } from "vitest";
import {
  taskList,
  qualityList,
  anomalyList,
  type Part,
  type QualityItem,
  type Anomaly,
} from "./dashboard.js";
import { asTimestamp } from "./core.js";

/** Timestamp for 2025-02-18 12:00:00 UTC (past cutoff for 2025-02-17 and 2025-02-18). */
const NOW_UTC = asTimestamp(new Date("2025-02-18T12:00:00Z").getTime());

describe("taskList", () => {
  it("orders by status (ActionRequired first), then endDate asc, then partId", () => {
    const parts: Part[] = [
      { partId: "B", endDate: "2025-02-18", approved: false }, // ActionRequired
      { partId: "A", endDate: "2025-02-17", approved: false }, // ActionRequired
      {
        partId: "C",
        endDate: "2025-02-15",
        approved: false,
        notificationDate: "2025-02-25",
      }, // Snoozed (now < cutoff(25))
      { partId: "D", endDate: "2025-02-18", approved: false }, // ActionRequired
      {
        partId: "E",
        endDate: "2025-02-16",
        approved: false,
        notificationDate: "2025-02-26",
      }, // Snoozed
    ];
    const result = taskList(parts, NOW_UTC, "UTC");
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
      { partId: "X", endDate: "2025-02-17", approved: false }, // overdue (18 >= 18 00:01)
      { partId: "Y", endDate: "2025-02-18", approved: false }, // not overdue yet (18 12:00 < 19 00:01? No - 18 12:00 > 19 00:01? endDate+1 = 2025-02-19, cutoff is 19 00:01, now is 18 12:00, so NOT past cutoff(19)) -> not overdue
    ];
    // NOW_UTC = 2025-02-18 12:00 UTC. cutoff(2025-02-19) = 2025-02-19 00:01 UTC. now < that, so Y not overdue.
    // cutoff(2025-02-18) = 2025-02-18 00:01 UTC. now (18 12:00) >= that, so X included. endDate+1 = 2025-02-19, cutoff = 19 00:01. now < that, so X not overdue? User said: overdue iff now >= cutoff(endDate + 1 day). So X: endDate=17, +1=18, cutoff(18)=18 00:01. now (18 12:00) >= 18 00:01. So X is overdue.
    const result = taskList(parts, NOW_UTC, "UTC");
    expect(result[0]).toMatchObject({ partId: "X", overdue: true });
    expect(result[1]).toMatchObject({ partId: "Y", overdue: false });
  });

  it("excludes approved parts and parts before cutoff(endDate)", () => {
    const parts: Part[] = [
      { partId: "P1", endDate: "2025-02-20", approved: true },
      { partId: "P2", endDate: "2025-02-19", approved: false },
    ];
    const beforeCutoff = asTimestamp(new Date("2025-02-19T00:00:00Z").getTime());
    const result = taskList(parts, beforeCutoff, "UTC");
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
