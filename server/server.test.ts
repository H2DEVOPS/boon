import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { resetEventStore } from "./deps.js";

/** 2025-02-18 12:00 UTC - past cutoff for 2025-02-17 and 2025-02-18. */
const NOW = new Date("2025-02-18T12:00:00Z").getTime();
/** 2025-02-25 00:01 UTC - past cutoff for notificationDate 2025-02-25. */
const AFTER_SNOOZE = new Date("2025-02-25T00:01:00Z").getTime();
/** 2025-02-19 12:00 UTC - before notificationDate cutoff. */
const BEFORE_SNOOZE = new Date("2025-02-19T12:00:00Z").getTime();

describe("server API", () => {
  beforeEach(() => resetEventStore());

  it("approving a part makes it disappear from tasks", async () => {
    const app = createApp();

    const before = await request(app)
      .get("/api/dashboard")
      .query({ now: NOW });
    expect(before.status).toBe(200);
    const tasksBefore = before.body.tasks as Array<{ partId: string }>;
    const p1Before = tasksBefore.find((t: { partId: string }) => t.partId === "p1");
    expect(p1Before).toBeDefined();

    await request(app)
      .post("/api/parts/p1/approve")
      .send({ timestamp: NOW })
      .expect(200);

    const after = await request(app)
      .get("/api/dashboard")
      .query({ now: NOW });
    expect(after.status).toBe(200);
    const tasksAfter = after.body.tasks as Array<{ partId: string }>;
    const p1After = tasksAfter.find((t: { partId: string }) => t.partId === "p1");
    expect(p1After).toBeUndefined();
  });

  it("snooze makes it show as Snoozed until notificationDate cutoff", async () => {
    const app = createApp();

    await request(app)
      .post("/api/parts/p4/snooze")
      .send({ timestamp: NOW, notificationDate: "2025-02-25" })
      .expect(200);

    const beforeCutoff = await request(app)
      .get("/api/dashboard")
      .query({ now: BEFORE_SNOOZE });
    expect(beforeCutoff.status).toBe(200);
    const p4Before = beforeCutoff.body.tasks.find((t: { partId: string }) => t.partId === "p4");
    expect(p4Before).toBeDefined();
    expect(p4Before.status).toBe("Snoozed");

    const afterCutoff = await request(app)
      .get("/api/dashboard")
      .query({ now: AFTER_SNOOZE });
    expect(afterCutoff.status).toBe(200);
    const p4After = afterCutoff.body.tasks.find((t: { partId: string }) => t.partId === "p4");
    expect(p4After).toBeDefined();
    expect(p4After.status).toBe("ActionRequired");
  });

  it("order stability of events", async () => {
    const app = createApp();
    const ts1 = 1000;
    const ts2 = 2000;
    const ts3 = 3000;

    await request(app)
      .post("/api/events")
      .send({ type: "PartApproved", partId: "x", timestamp: ts1 })
      .expect(201);
    await request(app)
      .post("/api/events")
      .send({ type: "PartReopened", partId: "x", timestamp: ts2 })
      .expect(201);
    await request(app)
      .post("/api/events")
      .send({ type: "PartApproved", partId: "y", timestamp: ts3 })
      .expect(201);

    const res = await request(app).get("/api/events");
    expect(res.status).toBe(200);
    const events = res.body as Array<{ type: string; partId: string; timestamp: number }>;
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "PartApproved", partId: "x", timestamp: ts1 });
    expect(events[1]).toMatchObject({ type: "PartReopened", partId: "x", timestamp: ts2 });
    expect(events[2]).toMatchObject({ type: "PartApproved", partId: "y", timestamp: ts3 });
  });
});
