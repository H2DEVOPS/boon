import { describe, expect, it } from "vitest";
import { InMemoryProjectEventStore } from "./eventStore.js";
import { asTimestamp } from "./core.js";

const TS = asTimestamp(1000);
const TS2 = asTimestamp(1001);
const TS3 = asTimestamp(1002);

describe("InMemoryProjectEventStore", () => {
  it("append + loadByProject preserves order per project", async () => {
    const store = new InMemoryProjectEventStore();
    const events = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS2 },
    ];
    await store.append("proj1", events);
    const loaded = await store.loadByProject("proj1");
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ type: "PartApproved", partId: "p1" });
    expect(loaded[1]).toMatchObject({ type: "PartReopened", partId: "p1" });
  });

  it("loadByPart only returns matching events for project", async () => {
    const store = new InMemoryProjectEventStore();
    await store.append("proj1", [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartSnoozed" as const, partId: "p2", notificationDate: "2025-02-25", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS },
    ]);
    const p1 = await store.loadByPart("proj1", "p1");
    const p2 = await store.loadByPart("proj1", "p2");
    expect(p1).toHaveLength(2);
    expect(p1.every((e) => e.partId === "p1")).toBe(true);
    expect(p2).toHaveLength(1);
    expect(p2[0]).toMatchObject({ partId: "p2", type: "PartSnoozed" });
  });

  it("multiple appends maintain ordering per project", async () => {
    const store = new InMemoryProjectEventStore();
    await store.append("proj1", [{ type: "PartApproved" as const, partId: "p1", timestamp: TS }]);
    await store.append("proj1", [{ type: "PartReopened" as const, partId: "p1", timestamp: TS2 }]);
    await store.append("proj1", [{ type: "PartApproved" as const, partId: "p2", timestamp: TS3 }]);
    const all = await store.loadByProject("proj1");
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({ partId: "p1", type: "PartApproved" });
    expect(all[1]).toMatchObject({ partId: "p1", type: "PartReopened" });
    expect(all[2]).toMatchObject({ partId: "p2", type: "PartApproved" });
  });

  it("projects are isolated", async () => {
    const store = new InMemoryProjectEventStore();
    await store.append("proj1", [{ type: "PartApproved" as const, partId: "p1", timestamp: TS }]);
    await store.append("proj2", [{ type: "PartApproved" as const, partId: "q1", timestamp: TS }]);

    const proj1 = await store.loadByProject("proj1");
    const proj2 = await store.loadByProject("proj2");

    expect(proj1).toHaveLength(1);
    expect(proj1[0]).toMatchObject({ partId: "p1" });
    expect(proj2).toHaveLength(1);
    expect(proj2[0]).toMatchObject({ partId: "q1" });

    const p1InProj2 = await store.loadByPart("proj2", "p1");
    expect(p1InProj2).toHaveLength(0);
  });

  it("returned arrays are defensive copies", async () => {
    const store = new InMemoryProjectEventStore();
    await store.append("proj1", [{ type: "PartApproved" as const, partId: "p1", timestamp: TS }]);
    const a = await store.loadByProject("proj1");
    const b = await store.loadByProject("proj1");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.push({ type: "PartReopened" as const, partId: "p1", timestamp: TS2 });
    const c = await store.loadByProject("proj1");
    expect(c).toHaveLength(1);
  });
});
