/**
 * Domain inheritance — stage attribute inheritance and override engine.
 * No external libs.
 */

export type WeatherDependency = "Wind20" | "FrostRisk" | "Rain" | "Heat30";

/** Stage attributes (inheritable). */
export interface StageAttributes {
  readonly lockForMove: boolean;
  readonly showInDiary: boolean;
  readonly timelineColor: string;
  readonly controlResponsibilityUserId?: string;
  readonly ueLinks: Record<string, string>; // tag -> ueId
  readonly weatherDependency?: WeatherDependency;
  readonly selfCheckRequired: boolean;
}

/** Stage with attributes (partial = override only what this stage sets). */
export interface Stage {
  readonly id: string;
  readonly parentStageId?: string;
  readonly attrs: Partial<StageAttributes>;
}

/** Part with optional attribute overrides. Fields in attrsOverride use "override" policy. */
export interface Part {
  readonly id: string;
  readonly stageId: string;
  readonly attrsOverride?: Partial<StageAttributes>;
}

/** Default values for optional/missing attributes. */
function defaultAttrs(): StageAttributes {
  return {
    lockForMove: false,
    showInDiary: false,
    timelineColor: "",
    ueLinks: {},
    selfCheckRequired: false,
  };
}

function mergeAttrs(base: StageAttributes, overrides: Partial<StageAttributes>): StageAttributes {
  const result = { ...base };
  for (const k of Object.keys(overrides) as (keyof StageAttributes)[]) {
    const v = overrides[k];
    if (v === undefined) continue;
    (result as Record<string, unknown>)[k] =
      k === "ueLinks" && typeof v === "object"
        ? { ...(base.ueLinks ?? {}), ...(v ?? {}) }
        : v;
  }
  return result;
}

function mergePartials(
  base: Partial<StageAttributes>,
  overrides: Partial<StageAttributes>
): Partial<StageAttributes> {
  const result = { ...base };
  for (const k of Object.keys(overrides) as (keyof StageAttributes)[]) {
    const v = overrides[k];
    if (v === undefined) continue;
    (result as Record<string, unknown>)[k] =
      k === "ueLinks" && typeof v === "object"
        ? { ...(base.ueLinks ?? {}), ...(v ?? {}) }
        : v;
  }
  return result;
}

/** Resolves effective attributes for a part by inheriting from stageChain (root to leaf). */
export function resolvePartAttributes(
  part: Part,
  stageChain: readonly Stage[]
): StageAttributes {
  let attrs = defaultAttrs();
  for (const stage of stageChain) {
    attrs = mergeAttrs(attrs, stage.attrs);
  }
  if (part.attrsOverride && Object.keys(part.attrsOverride).length > 0) {
    attrs = mergeAttrs(attrs, part.attrsOverride);
  }
  return attrs;
}

export type ApplyMode = "applyWhereNotOverridden" | "forceOverride";

export interface ApplyResult {
  stages: Stage[];
  parts: Part[];
}

/** Applies stage attribute change. Returns updated stages and parts. */
export function applyStageChange(
  stageId: string,
  newAttrs: Partial<StageAttributes>,
  mode: ApplyMode,
  stages: readonly Stage[],
  parts: readonly Part[]
): ApplyResult {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const stage = stageById.get(stageId);
  if (!stage) return { stages: [...stages], parts: [...parts] };

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

  const subtreeStageIds = subtreeIds(stageId);
  const affectedParts = parts.filter((p) => subtreeStageIds.has(p.stageId));

  if (mode === "forceOverride") {
    // Update stage; remove part overrides for fields in newAttrs so stage value wins
    const updatedStages = stages.map((s) =>
      s.id === stageId ? { ...s, attrs: mergePartials(s.attrs, newAttrs) } : s
    );
    const newAttrKeys = new Set(Object.keys(newAttrs) as (keyof StageAttributes)[]);
    const updatedParts = parts.map((p) => {
      if (!affectedParts.some((a) => a.id === p.id)) return p;
      const current = p.attrsOverride ?? {};
      const next: Partial<StageAttributes> = {};
      for (const k of Object.keys(current) as (keyof StageAttributes)[]) {
        if (!newAttrKeys.has(k)) {
          (next as Record<string, unknown>)[k] = current[k];
        }
      }
      const attrsOverride = Object.keys(next).length > 0 ? next : undefined;
      return attrsOverride != null ? { ...p, attrsOverride } : { id: p.id, stageId: p.stageId };
    });
    return { stages: updatedStages, parts: updatedParts };
  }

  // applyWhereNotOverridden: update stage attrs only for fields no part has overridden
  const overriddenFields = new Set<keyof StageAttributes>();
  for (const p of affectedParts) {
    for (const k of Object.keys(p.attrsOverride ?? {}) as (keyof StageAttributes)[]) {
      overriddenFields.add(k);
    }
  }
  const attrsToApply: Partial<StageAttributes> = {};
  for (const k of Object.keys(newAttrs) as (keyof StageAttributes)[]) {
    if (!overriddenFields.has(k) && newAttrs[k] !== undefined) {
      (attrsToApply as Record<string, unknown>)[k] = newAttrs[k];
    }
  }
  const updatedStages = stages.map((s) =>
    s.id === stageId && Object.keys(attrsToApply).length > 0
      ? { ...s, attrs: mergePartials(s.attrs, attrsToApply) }
      : s
  );
  return { stages: updatedStages, parts: [...parts] };
}
