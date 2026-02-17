/**
 * Snapshot of projector state after replaying events.
 * Used to compact event logs and restart from a known state.
 */

export interface ProjectorSnapshot {
  readonly projectId: string;
  readonly lastEventTimestamp: number;
  readonly lifecycleStateByPart: Record<string, unknown>;
}

