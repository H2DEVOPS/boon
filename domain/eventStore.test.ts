import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "./eventStore.js";
import { asTimestamp } from "./core.js";

const TS = asTimestamp(1000);
const TS2 = asTimestamp(1001);
const TS3 = asTimestamp(1002);

describe("InMemoryEventStore", () => {
  it("append + loadAll preserves order", async () => {
    const store = new InMemoryEventStore();
    const events = [
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS2 },
    ];
    await store.append(events);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ type: "PartApproved", partId: "p1" });
    expect(loaded[1]).toMatchObject({ type: "PartReopened", partId: "p1" });
  });

  it("loadByPart only returns matching events", async () => {
    const store = new InMemoryEventStore();
    await store.append([
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
      { type: "PartSnoozed" as const, partId: "p2", notificationDate: "2025-02-25", timestamp: TS },
      { type: "PartReopened" as const, partId: "p1", timestamp: TS },
    ]);
    const p1 = await store.loadByPart("p1");
    const p2 = await store.loadByPart("p2");
    expect(p1).toHaveLength(2);
    expect(p1.every((e) => e.partId === "p1")).toBe(true);
    expect(p2).toHaveLength(1);
    expect(p2[0]).toMatchObject({ partId: "p2", type: "PartSnoozed" });
  });

  it("multiple appends maintain global ordering", async () => {
    const store = new InMemoryEventStore();
    await store.append([{ type: "PartApproved" as const, partId: "p1", timestamp: TS }]);
    await store.append([{ type: "PartReopened" as const, partId: "p1", timestamp: TS2 }]);
    await store.append([{ type: "PartApproved" as const, partId: "p2", timestamp: TS3 }]);
    const all = await store.loadAll();
    expect(all).toHaveLength(3);
    const e0 = all[0];
    const e1 = all[1];
    const e2 = all[2];
    expect(e0).toBeDefined();
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    expect(e0!.partId).toBe("p1");
    expect(e0!.type).toBe("PartApproved");
    expect(e1!.partId).toBe("p1");
    expect(e1!.type).toBe("PartReopened");
    expect(e2!.partId).toBe("p2");
  });

  it("returned arrays are defensive copies", async () => {
    const store = new InMemoryEventStore();
    await store.append([{ type: "PartApproved" as const, partId: "p1", timestamp: TS }]);
    const a = await store.loadAll();
    const b = await store.loadAll();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.push({ type: "PartReopened" as const, partId: "p1", timestamp: TS2 });
    const c = await store.loadAll();
    expect(c).toHaveLength(1);
  });
});
