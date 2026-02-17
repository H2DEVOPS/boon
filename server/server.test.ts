import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "./app.js";
import { resetEventStore } from "./deps.js";
import { mockReqRes } from "./mockReqRes.js";

/** 2025-02-18 12:00 UTC - past cutoff for 2025-02-17 and 2025-02-18. */
const NOW_ISO = "2025-02-18T12:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();
/** 2025-02-25 00:01 UTC - past cutoff for notificationDate 2025-02-25. */
const AFTER_SNOOZE_ISO = "2025-02-25T00:01:00.000Z";
/** 2025-02-19 12:00 UTC - before notificationDate cutoff. */
const BEFORE_SNOOZE_ISO = "2025-02-19T12:00:00.000Z";

describe("server API contract", () => {
  beforeEach(() => resetEventStore());

  describe("GET /health", () => {
    it("returns 200 + { status: 'ok' }", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/health" });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    });
  });

  describe("GET /api/projects", () => {
    it("returns 200 + [{ projectId, title }]", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/projects" });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as Array<{ projectId: string; title: string }>;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0]).toMatchObject({ projectId: expect.any(String), title: expect.any(String) });
    });
  });

  describe("GET /api/projects/:projectId/gantt", () => {
    it("returns 200 + { stages, parts } for existing project", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/projects/proj1/gantt" });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as { stages: unknown[]; parts: unknown[] };
      expect(data).toHaveProperty("stages");
      expect(data).toHaveProperty("parts");
      expect(Array.isArray(data.stages)).toBe(true);
      expect(Array.isArray(data.parts)).toBe(true);
    });

    it("returns 404 + error payload for missing project", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/projects/nonexistent/gantt" });

      await handle(req, res);

      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { code: string; message: string } };
      expect(data.error).toMatchObject({ code: "NOT_FOUND", message: "Project not found" });
    });
  });

  describe("GET /api/dashboard", () => {
    it("returns 400 when projectId missing", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/dashboard?now=" + NOW_ISO });

      await handle(req, res);

      expect(res.statusCode).toBe(400);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_INPUT");
    });

    it("returns 200 + { tasks, quality, anomalies, pace } with projectId and now", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "GET",
        url: `/api/dashboard?projectId=proj1&now=${NOW_ISO}`,
      });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as {
        tasks: unknown[];
        quality: unknown[];
        anomalies: unknown[];
        pace: unknown;
      };
      expect(data).toHaveProperty("tasks");
      expect(data).toHaveProperty("quality");
      expect(data).toHaveProperty("anomalies");
      expect(data).toHaveProperty("pace");
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(Array.isArray(data.quality)).toBe(true);
      expect(Array.isArray(data.anomalies)).toBe(true);
    });

    it("approving a part makes it disappear from tasks", async () => {
      const clock = { now: () => NOW_MS, timezone: "Europe/Stockholm" };
      const { handle } = createApp({ deps: { clock } });

      const before = mockReqRes({
        method: "GET",
        url: `/api/dashboard?projectId=proj1&now=${NOW_ISO}`,
      });
      await handle(before.req, before.res);
      expect(before.res.statusCode).toBe(200);
      const tasksBefore = (before.res.json() as { tasks: Array<{ partId: string }> }).tasks;
      const p1Before = tasksBefore.find((t) => t.partId === "p1");
      expect(p1Before).toBeDefined();

      const approve = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/approve",
        body: { at: NOW_ISO },
      });
      await handle(approve.req, approve.res);
      expect(approve.res.statusCode).toBe(200);

      const after = mockReqRes({
        method: "GET",
        url: `/api/dashboard?projectId=proj1&now=${NOW_ISO}`,
      });
      await handle(after.req, after.res);
      expect(after.res.statusCode).toBe(200);
      const tasksAfter = (after.res.json() as { tasks: Array<{ partId: string }> }).tasks;
      const p1After = tasksAfter.find((t) => t.partId === "p1");
      expect(p1After).toBeUndefined();
    });

    it("snooze makes it show as Snoozed until until cutoff", async () => {
      const clock = { now: () => NOW_MS, timezone: "Europe/Stockholm" };
      const { handle } = createApp({ deps: { clock } });

      const snoozeRes = mockReqRes({
        method: "POST",
        url: "/api/parts/p4/snooze",
        body: { until: "2025-02-25", at: NOW_ISO },
      });
      await handle(snoozeRes.req, snoozeRes.res);
      expect(snoozeRes.res.statusCode).toBe(200);

      const beforeCutoff = mockReqRes({
        method: "GET",
        url: `/api/dashboard?projectId=proj1&now=${BEFORE_SNOOZE_ISO}`,
      });
      await handle(beforeCutoff.req, beforeCutoff.res);
      expect(beforeCutoff.res.statusCode).toBe(200);
      const tasksBefore = (
        beforeCutoff.res.json() as { tasks: Array<{ partId: string; status: string }> }
      ).tasks;
      const p4Before = tasksBefore.find((t) => t.partId === "p4");
      expect(p4Before).toBeDefined();
      expect(p4Before!.status).toBe("Snoozed");

      const afterCutoff = mockReqRes({
        method: "GET",
        url: `/api/dashboard?projectId=proj1&now=${AFTER_SNOOZE_ISO}`,
      });
      await handle(afterCutoff.req, afterCutoff.res);
      expect(afterCutoff.res.statusCode).toBe(200);
      const tasksAfter = (
        afterCutoff.res.json() as { tasks: Array<{ partId: string; status: string }> }
      ).tasks;
      const p4After = tasksAfter.find((t) => t.partId === "p4");
      expect(p4After).toBeDefined();
      expect(p4After!.status).toBe("ActionRequired");
    });
  });

  describe("GET /api/parts/:partId/events", () => {
    it("returns 200 + events array", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/parts/p1/events" });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as unknown[];
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("POST /api/parts/:partId/approve", () => {
    it("returns 404 for missing part", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/parts/nonexistent/approve",
        body: { at: NOW_ISO },
      });

      await handle(req, res);

      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("NOT_FOUND");
    });

    it("returns 200 + { events, state } on success", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/approve",
        body: { at: NOW_ISO },
      });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as { events: unknown[]; state: unknown };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
      expect(data).toHaveProperty("state");
    });
  });

  describe("POST /api/parts/:partId/complete", () => {
    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/complete",
        body: { at: NOW_ISO },
      });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as { events: unknown[] };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("POST /api/parts/:partId/reopen", () => {
    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      // First approve, then reopen
      const approve = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/approve",
        body: { at: NOW_ISO },
      });
      await handle(approve.req, approve.res);

      const reopen = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/reopen",
        body: { at: NOW_ISO },
      });
      await handle(reopen.req, reopen.res);

      expect(reopen.res.statusCode).toBe(200);
      const data = reopen.res.json() as { events: unknown[] };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("POST /api/parts/:partId/snooze", () => {
    it("returns 400 when until missing", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/parts/p4/snooze",
        body: { at: NOW_ISO },
      });

      await handle(req, res);

      expect(res.statusCode).toBe(400);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_INPUT");
    });

    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/parts/p4/snooze",
        body: { until: "2025-02-25", at: NOW_ISO },
      });

      await handle(req, res);

      expect(res.statusCode).toBe(200);
      const data = res.json() as { events: unknown[] };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("event order stability", () => {
    it("events for a part are returned in append order", async () => {
      const { handle } = createApp();
      const ts1 = new Date("2025-02-18T10:00:00Z").getTime();
      const ts2 = new Date("2025-02-18T11:00:00Z").getTime();
      const at1 = "2025-02-18T10:00:00.000Z";
      const at2 = "2025-02-18T11:00:00.000Z";

      const r1 = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/approve",
        body: { at: at1 },
      });
      await handle(r1.req, r1.res);
      expect(r1.res.statusCode).toBe(200);

      const r2 = mockReqRes({
        method: "POST",
        url: "/api/parts/p1/reopen",
        body: { at: at2 },
      });
      await handle(r2.req, r2.res);
      expect(r2.res.statusCode).toBe(200);

      const listRes = mockReqRes({ method: "GET", url: "/api/parts/p1/events" });
      await handle(listRes.req, listRes.res);
      expect(listRes.res.statusCode).toBe(200);
      const events = listRes.res.json() as Array<{ type: string; partId: string; timestamp: number }>;
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ type: "PartApproved", partId: "p1", timestamp: ts1 });
      expect(events[1]).toMatchObject({ type: "PartReopened", partId: "p1", timestamp: ts2 });
    });
  });

  describe("404", () => {
    it("returns 404 + error payload for unknown route", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/unknown" });

      await handle(req, res);

      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });
});
