/**
 * Domain gantt — tree model + invariants for stages and parts.
 * No external libs.
 */

import { InvariantViolation } from "./errors.js";

/** Date-only string (YYYY-MM-DD). */
export type DateOnly = string;

/** Stage in the gantt tree. */
export interface Stage {
  readonly id: string;
  readonly parentStageId?: string;
  readonly title: string;
}

/** Part assigned to a stage. */
export interface Part {
  readonly id: string;
  readonly stageId: string;
  readonly title: string;
  readonly startDate: DateOnly;
  readonly endDate: DateOnly;
  readonly approved: boolean;
}

/** Validates tree invariants. Throws InvariantViolation on failure. */
export function validateTree(
  stages: readonly Stage[],
  parts: readonly Part[]
): void {
  const stageIds = new Set(stages.map((s) => s.id));
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // Check for cycles (follow parent chain from each node)
  const visiting = new Set<string>();

  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    visiting.add(id);
    const stage = stageById.get(id);
    const parentId = stage?.parentStageId;
    if (parentId != null && stageIds.has(parentId)) {
      if (hasCycle(parentId)) return true;
    }
    visiting.delete(id);
    return false;
  }

  for (const s of stages) {
    if (hasCycle(s.id)) {
      throw new InvariantViolation("Stage tree contains a cycle", {
        stageId: s.id,
      });
    }
  }

  const ROOT = "__root";
  const childrenOf = new Map<string, string[]>();
  for (const s of stages) {
    const parentKey = s.parentStageId ?? ROOT;
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
    childrenOf.get(parentKey)!.push(s.id);
  }

  // Collect all stage IDs in subtree (including self)
  function subtreeIds(id: string): Set<string> {
    const result = new Set<string>([id]);
    for (const childId of childrenOf.get(id) ?? []) {
      for (const sub of subtreeIds(childId)) result.add(sub);
    }
    return result;
  }

  // Every stage must have at least one part in its subtree
  const partsByStage = new Map<string, Part[]>();
  for (const p of parts) {
    if (!partsByStage.has(p.stageId)) partsByStage.set(p.stageId, []);
    partsByStage.get(p.stageId)!.push(p);
  }

  for (const s of stages) {
    const ids = subtreeIds(s.id);
    const partCount = [...ids].reduce(
      (sum, sid) => sum + (partsByStage.get(sid)?.length ?? 0),
      0
    );
    if (partCount === 0) {
      throw new InvariantViolation(
        "Stage must have at least one Part in its subtree",
        { stageId: s.id }
      );
    }
  }
}

/** Derived start/end dates from min/max of parts in stage subtree. */
export function stageDerivedDates(
  stageId: string,
  stages: readonly Stage[],
  parts: readonly Part[]
): { startDate: DateOnly; endDate: DateOnly } {
  const ROOT = "__root";
  const childrenOf = new Map<string, string[]>();
  for (const s of stages) {
    const parentKey = s.parentStageId ?? ROOT;
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
    childrenOf.get(parentKey)!.push(s.id);
  }

  function subtreeIds(id: string): Set<string> {
    const result = new Set<string>([id]);
    for (const childId of childrenOf.get(id) ?? []) {
      for (const sub of subtreeIds(childId)) result.add(sub);
    }
    return result;
  }

  const ids = subtreeIds(stageId);
  const relevantParts = parts.filter((p) => ids.has(p.stageId));
  if (relevantParts.length === 0) {
    throw new InvariantViolation(
      "Stage has no parts in subtree; cannot derive dates",
      { stageId }
    );
  }

  const startDates = relevantParts.map((p) => p.startDate);
  const endDates = relevantParts.map((p) => p.endDate);
  return {
    startDate: startDates.reduce((a, b) => (a <= b ? a : b)),
    endDate: endDates.reduce((a, b) => (a >= b ? a : b)),
  };
}
