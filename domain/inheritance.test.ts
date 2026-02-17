import { describe, expect, it } from "vitest";
import {
  resolvePartAttributes,
  applyStageChange,
  type Stage,
  type Part,
} from "./inheritance.js";

describe("resolvePartAttributes", () => {
  it("resolves inheritance through 3 stages", () => {
    const root: Stage = {
      id: "root",
      attrs: { timelineColor: "red", selfCheckRequired: true },
    };
    const mid: Stage = {
      id: "mid",
      parentStageId: "root",
      attrs: { timelineColor: "blue", lockForMove: true },
    };
    const leaf: Stage = {
      id: "leaf",
      parentStageId: "mid",
      attrs: { showInDiary: true },
    };
    const stageChain = [root, mid, leaf];

    const part: Part = { id: "p1", stageId: "leaf" };
    const attrs = resolvePartAttributes(part, stageChain);

    expect(attrs.timelineColor).toBe("blue"); // leaf inherits mid (overrides root)
    expect(attrs.selfCheckRequired).toBe(true); // from root
    expect(attrs.lockForMove).toBe(true); // from mid
    expect(attrs.showInDiary).toBe(true); // from leaf
  });

  it("part attrsOverride wins over stage chain", () => {
    const root: Stage = {
      id: "root",
      attrs: { timelineColor: "red" },
    };
    const leaf: Stage = {
      id: "leaf",
      parentStageId: "root",
      attrs: { timelineColor: "blue" },
    };
    const stageChain = [root, leaf];

    const part: Part = {
      id: "p1",
      stageId: "leaf",
      attrsOverride: { timelineColor: "green" },
    };
    const attrs = resolvePartAttributes(part, stageChain);

    expect(attrs.timelineColor).toBe("green");
  });
});

describe("applyStageChange", () => {
  it("local override wins in applyWhereNotOverridden", () => {
    const stages: Stage[] = [
      {
        id: "root",
        attrs: { timelineColor: "red", lockForMove: false },
      },
      {
        id: "child",
        parentStageId: "root",
        attrs: { timelineColor: "blue", lockForMove: true },
      },
    ];
    const parts: Part[] = [
      {
        id: "p1",
        stageId: "child",
        attrsOverride: { timelineColor: "green" }, // part overrides
      },
    ];

    const result = applyStageChange(
      "child",
      { timelineColor: "purple" },
      "applyWhereNotOverridden",
      stages,
      parts
    );

    // Part has overridden timelineColor, so stage should NOT get purple
    const childStage = result.stages.find((s) => s.id === "child");
    expect(childStage).toBeDefined();
    expect(childStage!.attrs.timelineColor).toBe("blue");
    const part0 = result.parts[0];
    expect(part0).toBeDefined();
    expect(part0!.attrsOverride?.timelineColor).toBe("green");
  });

  it("forceOverride overwrites existing part overrides", () => {
    const stages: Stage[] = [
      { id: "root", attrs: { timelineColor: "red" } },
      {
        id: "child",
        parentStageId: "root",
        attrs: { timelineColor: "blue" },
      },
    ];
    const parts: Part[] = [
      {
        id: "p1",
        stageId: "child",
        attrsOverride: { timelineColor: "green", lockForMove: true },
      },
    ];

    const result = applyStageChange(
      "child",
      { timelineColor: "purple" },
      "forceOverride",
      stages,
      parts
    );

    // Stage gets purple
    const childStage = result.stages.find((s) => s.id === "child");
    expect(childStage).toBeDefined();
    expect(childStage!.attrs.timelineColor).toBe("purple");
    // Part's timelineColor override removed; lockForMove kept
    const p = result.parts[0];
    expect(p).toBeDefined();
    expect(p!.attrsOverride?.timelineColor).toBeUndefined();
    expect(p!.attrsOverride?.lockForMove).toBe(true);
  });
});
