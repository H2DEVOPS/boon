import { describe, expect, it } from "vitest";
import {
  projectPartCompletionStatus,
  computeStageProgress,
  projectProgress,
  type PartCompletionStatus,
} from "./progress.js";
import type { PartLifecycleEvent } from "./events.js";
import type { ProjectSnapshot } from "./projectSnapshot.js";
import { defaultSwedishProjectCalendar } from "./calendar.js";
import { asTimestamp } from "./core.js";

const CAL = defaultSwedishProjectCalendar();
const TZ = "Europe/Stockholm";

function ts(iso: string) {
  return asTimestamp(new Date(iso).getTime());
}

describe("projectPartCompletionStatus", () => {
  it("Exact endDate → OnTime", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-17T12:00:00Z"), version: 0 },
    ];
    const status = projectPartCompletionStatus(events, "p1", "2025-02-17", CAL, TZ);
    expect(status).toBe<PartCompletionStatus>("OnTime");
  });

  it("+1 working day → OnTime", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-18T09:00:00Z"), version: 0 },
    ];
    const status = projectPartCompletionStatus(events, "p1", "2025-02-17", CAL, TZ);
    expect(status).toBe("OnTime");
  });

  it("+2 working days → Delayed", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-19T09:00:00Z"), version: 0 },
    ];
    const status = projectPartCompletionStatus(events, "p1", "2025-02-17", CAL, TZ);
    expect(status).toBe("Delayed");
  });

  it("Early completion → Early", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-13T09:00:00Z"), version: 0 },
    ];
    const status = projectPartCompletionStatus(events, "p1", "2025-02-17", CAL, TZ);
    expect(status).toBe("Early");
  });

  it("Missing completion → NotCompleted", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartApproved", partId: "p1", timestamp: ts("2025-02-17T09:00:00Z"), version: 0 },
    ];
    const status = projectPartCompletionStatus(events, "p1", "2025-02-17", CAL, TZ);
    expect(status).toBe("NotCompleted");
  });
});

describe("computeStageProgress", () => {
  const snapshot: ProjectSnapshot = {
    projectId: "proj",
    title: "Proj",
    stages: [
      { id: "root", title: "Root" },
      { id: "a", parentStageId: "root", title: "A" },
    ],
    parts: [
      { partId: "p1", endDate: "2025-02-17", stageId: "root", title: "P1", startDate: "2025-02-01" },
      { partId: "p2", endDate: "2025-02-17", stageId: "a", title: "P2", startDate: "2025-02-01" },
    ],
    calendar: CAL,
  };

  it("Stage subtree aggregation correct", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-17T10:00:00Z"), version: 0 }, // OnTime
      { type: "PartCompleted", partId: "p2", timestamp: ts("2025-02-19T10:00:00Z"), version: 0 }, // Delayed
    ];
    const progress = computeStageProgress("root", snapshot, events, CAL, TZ);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(2);
    expect(progress.percent).toBe(1);
  });
});

describe("projectProgress", () => {
  const snapshot: ProjectSnapshot = {
    projectId: "proj",
    title: "Proj",
    stages: [{ id: "s1", title: "S1" }],
    parts: [
      { partId: "A", endDate: "2025-02-17", stageId: "s1", title: "A", startDate: "2025-02-01" },
      { partId: "B", endDate: "2025-02-17", stageId: "s1", title: "B", startDate: "2025-02-01" },
      { partId: "C", endDate: "2025-02-17", stageId: "s1", title: "C", startDate: "2025-02-01" },
      { partId: "D", endDate: "2025-02-17", stageId: "s1", title: "D", startDate: "2025-02-01" },
    ],
    calendar: CAL,
  };

  it("Percent deterministic with mix of statuses", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "A", timestamp: ts("2025-02-17T10:00:00Z"), version: 0 }, // OnTime
      { type: "PartCompleted", partId: "B", timestamp: ts("2025-02-19T10:00:00Z"), version: 0 }, // Delayed
      { type: "PartCompleted", partId: "C", timestamp: ts("2025-02-13T10:00:00Z"), version: 0 }, // Early
      // D not completed
    ];
    const stats = projectProgress(snapshot, events, CAL, TZ);
    expect(stats.onTime).toBe(1);
    expect(stats.delayed).toBe(1);
    expect(stats.early).toBe(1);
    expect(stats.notCompleted).toBe(1);
    expect(stats.percent).toBeCloseTo(3 / 4);
  });
});

