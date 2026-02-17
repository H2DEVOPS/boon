import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, promises as fsPromises } from "node:fs";
import path from "node:path";
import os from "node:os";
import { FileProjectEventStore } from "./fileEventStore.js";
import { asTimestamp } from "../domain/core.js";

const TS = asTimestamp(1_000);
const TS2 = asTimestamp(2_000);

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

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

