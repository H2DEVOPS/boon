import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "./app.js";
import { resetEventStore } from "./deps.js";
import { mockReqRes } from "./mockReqRes.js";

/** 2025-02-18 12:00 UTC - past cutoff for 2025-02-17 and 2025-02-18. */
const NOW = new Date("2025-02-18T12:00:00Z").getTime();
/** 2025-02-25 00:01 UTC - past cutoff for notificationDate 2025-02-25. */
const AFTER_SNOOZE = new Date("2025-02-25T00:01:00Z").getTime();
/** 2025-02-19 12:00 UTC - before notificationDate cutoff. */
const BEFORE_SNOOZE = new Date("2025-02-19T12:00:00Z").getTime();

describe("server API", () => {
  beforeEach(() => resetEventStore());

  it("GET /health returns 200 + { status: 'ok' }", async () => {
    const { handle } = createApp();
    const { req, res } = mockReqRes({ method: "GET", url: "/health" });

    await handle(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("approving a part makes it disappear from tasks", async () => {
    const clock = { now: () => NOW, timezone: "Europe/Stockholm" };
    const { handle } = createApp({ deps: { clock } });

    const before = mockReqRes({ method: "GET", url: `/api/dashboard?now=${NOW}` });
    await handle(before.req, before.res);
    expect(before.res.statusCode).toBe(200);
    const tasksBefore = (before.res.json() as { tasks: Array<{ partId: string }> }).tasks;
    const p1Before = tasksBefore.find((t) => t.partId === "p1");
    expect(p1Before).toBeDefined();

    const approve = mockReqRes({
      method: "POST",
      url: "/api/parts/p1/approve",
      body: { timestamp: NOW },
    });
    await handle(approve.req, approve.res);
    expect(approve.res.statusCode).toBe(200);

    const after = mockReqRes({ method: "GET", url: `/api/dashboard?now=${NOW}` });
    await handle(after.req, after.res);
    expect(after.res.statusCode).toBe(200);
    const tasksAfter = (after.res.json() as { tasks: Array<{ partId: string }> }).tasks;
    const p1After = tasksAfter.find((t) => t.partId === "p1");
    expect(p1After).toBeUndefined();
  });

  it("snooze makes it show as Snoozed until notificationDate cutoff", async () => {
    const clock = { now: () => NOW, timezone: "Europe/Stockholm" };
    const { handle } = createApp({ deps: { clock } });

    const snoozeRes = mockReqRes({
      method: "POST",
      url: "/api/parts/p4/snooze",
      body: { timestamp: NOW, notificationDate: "2025-02-25" },
    });
    await handle(snoozeRes.req, snoozeRes.res);
    expect(snoozeRes.res.statusCode).toBe(200);

    const beforeCutoff = mockReqRes({
      method: "GET",
      url: `/api/dashboard?now=${BEFORE_SNOOZE}`,
    });
    await handle(beforeCutoff.req, beforeCutoff.res);
    expect(beforeCutoff.res.statusCode).toBe(200);
    const tasksBefore = (beforeCutoff.res.json() as { tasks: Array<{ partId: string; status: string }> }).tasks;
    const p4Before = tasksBefore.find((t) => t.partId === "p4");
    expect(p4Before).toBeDefined();
    expect(p4Before!.status).toBe("Snoozed");

    const afterCutoff = mockReqRes({
      method: "GET",
      url: `/api/dashboard?now=${AFTER_SNOOZE}`,
    });
    await handle(afterCutoff.req, afterCutoff.res);
    expect(afterCutoff.res.statusCode).toBe(200);
    const tasksAfter = (afterCutoff.res.json() as { tasks: Array<{ partId: string; status: string }> }).tasks;
    const p4After = tasksAfter.find((t) => t.partId === "p4");
    expect(p4After).toBeDefined();
    expect(p4After!.status).toBe("ActionRequired");
  });

  it("order stability of events", async () => {
    const { handle } = createApp();
    const ts1 = 1000;
    const ts2 = 2000;
    const ts3 = 3000;

    const r1 = mockReqRes({ method: "POST", url: "/api/events", body: { type: "PartApproved", partId: "x", timestamp: ts1 } });
    await handle(r1.req, r1.res);
    expect(r1.res.statusCode).toBe(201);

    const r2 = mockReqRes({ method: "POST", url: "/api/events", body: { type: "PartReopened", partId: "x", timestamp: ts2 } });
    await handle(r2.req, r2.res);
    expect(r2.res.statusCode).toBe(201);

    const r3 = mockReqRes({ method: "POST", url: "/api/events", body: { type: "PartApproved", partId: "y", timestamp: ts3 } });
    await handle(r3.req, r3.res);
    expect(r3.res.statusCode).toBe(201);

    const listRes = mockReqRes({ method: "GET", url: "/api/events" });
    await handle(listRes.req, listRes.res);
    expect(listRes.res.statusCode).toBe(200);
    const events = listRes.res.json() as Array<{ type: string; partId: string; timestamp: number }>;
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "PartApproved", partId: "x", timestamp: ts1 });
    expect(events[1]).toMatchObject({ type: "PartReopened", partId: "x", timestamp: ts2 });
    expect(events[2]).toMatchObject({ type: "PartApproved", partId: "y", timestamp: ts3 });
  });

  it("GET /api/dashboard returns deterministic output with ?now", async () => {
    const { handle } = createApp();
    const { req, res } = mockReqRes({ method: "GET", url: `/api/dashboard?now=${NOW}` });

    await handle(req, res);

    expect(res.statusCode).toBe(200);
    const data = res.json() as { tasks: unknown[]; quality: unknown[]; anomalies: unknown[] };
    expect(data).toHaveProperty("tasks");
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(data).toHaveProperty("quality");
    expect(data).toHaveProperty("anomalies");
  });
});
