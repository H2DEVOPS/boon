import { describe, expect, it } from "vitest";
import {
  validateTree,
  stageDerivedDates,
  type Stage,
  type Part,
} from "./gantt.js";
import { InvariantViolation } from "./errors.js";

describe("validateTree", () => {
  it("valid tree passes", () => {
    const stages: Stage[] = [
      { id: "root", title: "Root" },
      { id: "a", parentStageId: "root", title: "A" },
      { id: "b", parentStageId: "root", title: "B" },
      { id: "c", parentStageId: "a", title: "C" },
    ];
    const parts: Part[] = [
      { id: "p1", stageId: "root", title: "P1", startDate: "2025-01-01", endDate: "2025-01-10", approved: false },
      { id: "p2", stageId: "a", title: "P2", startDate: "2025-01-05", endDate: "2025-01-15", approved: false },
      { id: "p3", stageId: "c", title: "P3", startDate: "2025-01-20", endDate: "2025-01-25", approved: false },
      { id: "p4", stageId: "b", title: "P4", startDate: "2025-02-01", endDate: "2025-02-10", approved: true },
    ];
    expect(() => validateTree(stages, parts)).not.toThrow();
  });

  it("cycle fails", () => {
    const stages: Stage[] = [
      { id: "a", parentStageId: "c", title: "A" },
      { id: "b", parentStageId: "a", title: "B" },
      { id: "c", parentStageId: "b", title: "C" },
    ];
    const parts: Part[] = [
      { id: "p1", stageId: "a", title: "P1", startDate: "2025-01-01", endDate: "2025-01-10", approved: false },
    ];
    expect(() => validateTree(stages, parts)).toThrow(InvariantViolation);
    expect(() => validateTree(stages, parts)).toThrow(/cycle/);
  });

  it("stage without part in subtree fails", () => {
    const stages: Stage[] = [
      { id: "root", title: "Root" },
      { id: "child", parentStageId: "root", title: "Child" },
    ];
    const parts: Part[] = [
      { id: "p1", stageId: "root", title: "P1", startDate: "2025-01-01", endDate: "2025-01-10", approved: false },
    ];
    // Child has no parts in its subtree
    expect(() => validateTree(stages, parts)).toThrow(InvariantViolation);
    expect(() => validateTree(stages, parts)).toThrow(/subtree/);
  });
});

describe("stageDerivedDates", () => {
  it("derived dates correct across nested stages", () => {
    const stages: Stage[] = [
      { id: "root", title: "Root" },
      { id: "a", parentStageId: "root", title: "A" },
      { id: "b", parentStageId: "a", title: "B" },
    ];
    const parts: Part[] = [
      { id: "p1", stageId: "root", title: "P1", startDate: "2025-01-01", endDate: "2025-01-10", approved: false },
      { id: "p2", stageId: "a", title: "P2", startDate: "2025-01-05", endDate: "2025-01-20", approved: false },
      { id: "p3", stageId: "b", title: "P3", startDate: "2025-01-15", endDate: "2025-01-25", approved: false },
    ];

    const rootDates = stageDerivedDates("root", stages, parts);
    expect(rootDates).toEqual({ startDate: "2025-01-01", endDate: "2025-01-25" });

    const aDates = stageDerivedDates("a", stages, parts);
    expect(aDates).toEqual({ startDate: "2025-01-05", endDate: "2025-01-25" });

    const bDates = stageDerivedDates("b", stages, parts);
    expect(bDates).toEqual({ startDate: "2025-01-15", endDate: "2025-01-25" });
  });
});
