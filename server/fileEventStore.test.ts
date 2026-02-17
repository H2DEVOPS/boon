import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, promises as fsPromises, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { FileProjectEventStore } from "./fileEventStore.js";
import { asTimestamp } from "../domain/core.js";
import type { ProjectorSnapshot } from "../domain/projectorSnapshot.js";

const TS = asTimestamp(1_000);
const TS2 = asTimestamp(2_000);
const TS3 = asTimestamp(3_000);

describe("FileProjectEventStore", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(os.tmpdir(), "events-"));
  });

  it("append then loadByProject returns same events", async () => {
    const store = new FileProjectEventStore(rootDir);
    const events = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS2 },
    ];
    await store.append("proj1", events);

    const loaded = await store.loadByProject("proj1");
    expect(loaded).toEqual(events);
  });

  it("isolation between projects creates separate files", async () => {
    const store = new FileProjectEventStore(rootDir);
    await store.append("proj1", [{ type: "PartApproved" as const, partId: "p1", timestamp: TS }]);
    await store.append("proj2", [{ type: "PartApproved" as const, partId: "q1", timestamp: TS }]);

    const file1 = path.join(rootDir, "proj1.events.ndjson");
    const file2 = path.join(rootDir, "proj2.events.ndjson");
    expect(existsSync(file1)).toBe(true);
    expect(existsSync(file2)).toBe(true);

    const text1 = readFileSync(file1, "utf8").trim().split("\n");
    const text2 = readFileSync(file2, "utf8").trim().split("\n");
    expect(text1).toHaveLength(1);
    expect(text2).toHaveLength(1);
  });

  it("load missing project file returns empty array", async () => {
    const store = new FileProjectEventStore(rootDir);
    const loaded = await store.loadByProject("missing");
    expect(loaded).toEqual([]);
  });

  it("invalid JSON line throws", async () => {
    const file = path.join(rootDir, "badproj.events.ndjson");
    // Write invalid JSON line
    await fsPromises.writeFile(file, "not-json\n", "utf8");
    const store = new FileProjectEventStore(rootDir);
    await expect(store.loadByProject("badproj")).rejects.toThrow("Invalid JSON in event log");
  });

  it("new instance can replay events from disk", async () => {
    const store1 = new FileProjectEventStore(rootDir);
    const events = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartSnoozed" as const, partId: "p1", notificationDate: "2025-02-25", timestamp: TS2 },
    ];
    await store1.append("proj1", events);

    const store2 = new FileProjectEventStore(rootDir);
    const loaded = await store2.loadByProject("proj1");
    expect(loaded).toEqual(events);
  });

  it("append → compact → reload → state preserved via snapshot", async () => {
    const store = new FileProjectEventStore(rootDir);
    const events = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS2 },
    ];
    await store.append("proj1", events);

    const snapshot: ProjectorSnapshot = {
      projectId: "proj1",
      lastEventTimestamp: TS2,
      lifecycleStateByPart: { p1: { state: "SomeState" } },
    };
    await store.compact("proj1", snapshot);

    // After compaction, no events after TS2, so loadByProject returns []
    const loaded = await store.loadByProject("proj1");
    expect(loaded).toEqual([]);

    const snapFile = path.join(rootDir, "proj1.events.snapshot.json");
    expect(existsSync(snapFile)).toBe(true);
    const snapJson = JSON.parse(readFileSync(snapFile, "utf8")) as ProjectorSnapshot;
    expect(snapJson.projectId).toBe("proj1");
    expect(snapJson.lastEventTimestamp).toBe(TS2);
  });

  it("snapshot + later events replay correctly", async () => {
    const store = new FileProjectEventStore(rootDir);
    await store.append("proj1", [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS2 },
    ]);

    const snapshot: ProjectorSnapshot = {
      projectId: "proj1",
      lastEventTimestamp: TS2,
      lifecycleStateByPart: {},
    };
    await store.compact("proj1", snapshot);

    const laterEvents = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS3 },
    ];
    await store.append("proj1", laterEvents);

    const loaded = await store.loadByProject("proj1");
    expect(loaded).toEqual(laterEvents);
  });

  it("compaction shrinks log", async () => {
    const store = new FileProjectEventStore(rootDir);
    const manyEvents = Array.from({ length: 10 }, (_, i) => ({
      type: "PartApproved" as const,
      partId: `p${i}`,
      timestamp: asTimestamp(1_000 + i),
    }));
    await store.append("proj1", manyEvents);

    const file = path.join(rootDir, "proj1.events.ndjson");
    const beforeSize = statSync(file).size;
    expect(beforeSize).toBeGreaterThan(0);

    const snapshot: ProjectorSnapshot = {
      projectId: "proj1",
      lastEventTimestamp: manyEvents[manyEvents.length - 1]!.timestamp,
      lifecycleStateByPart: {},
    };
    await store.compact("proj1", snapshot);

    const afterSize = statSync(file).size;
    expect(afterSize).toBeLessThanOrEqual(beforeSize);
  });

  it("missing snapshot still works", async () => {
    const store = new FileProjectEventStore(rootDir);
    const events = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartApproved" as const, partId: "p2", timestamp: TS2 },
    ];
    await store.append("proj1", events);

    const loaded = await store.loadByProject("proj1");
    expect(loaded).toEqual(events);
  });

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

