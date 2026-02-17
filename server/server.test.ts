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

const approve = (projectId: string, partId: string, body?: { at?: string }) =>
  mockReqRes({
    method: "POST",
    url: `/api/projects/${projectId}/parts/${partId}/approve`,
    body: body ?? { at: NOW_ISO },
  });

const snooze = (projectId: string, partId: string, body: { until: string; at?: string }) =>
  mockReqRes({
    method: "POST",
    url: `/api/projects/${projectId}/parts/${partId}/snooze`,
    body,
  });

const dashboard = (projectId: string, now?: string) =>
  mockReqRes({
    method: "GET",
    url: `/api/dashboard?projectId=${projectId}${now ? `&now=${now}` : ""}`,
  });

const partEvents = (projectId: string, partId: string) =>
  mockReqRes({ method: "GET", url: `/api/projects/${projectId}/parts/${partId}/events` });

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
        pace: { average: number | null; worst: number | null; best: number | null };
      };
      expect(data).toHaveProperty("tasks");
      expect(data).toHaveProperty("quality");
      expect(data).toHaveProperty("anomalies");
      expect(data).toHaveProperty("pace");
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(data.pace).toHaveProperty("average");
      expect(data.pace).toHaveProperty("worst");
      expect(data.pace).toHaveProperty("best");
    });

    it("approving a part makes it disappear from tasks", async () => {
      const clock = { now: () => NOW_MS, timezone: "Europe/Stockholm" };
      const { handle } = createApp({ deps: { clock } });

      const before = dashboard("proj1", NOW_ISO);
      await handle(before.req, before.res);
      expect(before.res.statusCode).toBe(200);
      const tasksBefore = (before.res.json() as { tasks: Array<{ partId: string }> }).tasks;
      expect(tasksBefore.find((t) => t.partId === "p1")).toBeDefined();

      const appr = approve("proj1", "p1");
      await handle(appr.req, appr.res);
      expect(appr.res.statusCode).toBe(200);

      const after = dashboard("proj1", NOW_ISO);
      await handle(after.req, after.res);
      expect(after.res.statusCode).toBe(200);
      const tasksAfter = (after.res.json() as { tasks: Array<{ partId: string }> }).tasks;
      expect(tasksAfter.find((t) => t.partId === "p1")).toBeUndefined();
    });

    it("snooze makes it show as Snoozed until until cutoff", async () => {
      const clock = { now: () => NOW_MS, timezone: "Europe/Stockholm" };
      const { handle } = createApp({ deps: { clock } });

      const snz = snooze("proj1", "p4", { until: "2025-02-25", at: NOW_ISO });
      await handle(snz.req, snz.res);
      expect(snz.res.statusCode).toBe(200);

      const beforeCutoff = dashboard("proj1", BEFORE_SNOOZE_ISO);
      await handle(beforeCutoff.req, beforeCutoff.res);
      expect(beforeCutoff.res.statusCode).toBe(200);
      const p4Before = (beforeCutoff.res.json() as { tasks: Array<{ partId: string; status: string }> }).tasks.find(
        (t) => t.partId === "p4"
      );
      expect(p4Before).toBeDefined();
      expect(p4Before!.status).toBe("Snoozed");

      const afterCutoff = dashboard("proj1", AFTER_SNOOZE_ISO);
      await handle(afterCutoff.req, afterCutoff.res);
      expect(afterCutoff.res.statusCode).toBe(200);
      const p4After = (afterCutoff.res.json() as { tasks: Array<{ partId: string; status: string }> }).tasks.find(
        (t) => t.partId === "p4"
      );
      expect(p4After).toBeDefined();
      expect(p4After!.status).toBe("ActionRequired");
    });

    it("dashboard only includes events for the project", async () => {
      const { handle } = createApp();
      await handle(approve("proj1", "p1").req, approve("proj1", "p1").res);
      await handle(approve("proj2", "q1").req, approve("proj2", "q1").res);

      const d1 = dashboard("proj1", NOW_ISO);
      await handle(d1.req, d1.res);
      const tasks1 = (d1.res.json() as { tasks: Array<{ partId: string }> }).tasks;
      expect(tasks1.some((t) => t.partId === "p1")).toBe(false);
      expect(tasks1.some((t) => t.partId === "q1")).toBe(false);

      const d2 = dashboard("proj2", NOW_ISO);
      await handle(d2.req, d2.res);
      const tasks2 = (d2.res.json() as { tasks: Array<{ partId: string }> }).tasks;
      expect(tasks2.some((t) => t.partId === "q1")).toBe(false);
    });

    it("pace ignores non-completed parts", async () => {
      const { handle } = createApp();
      // Approve without completing: should not affect pace.
      await handle(approve("proj1", "p1").req, approve("proj1", "p1").res);

      const d = dashboard("proj1", NOW_ISO);
      await handle(d.req, d.res);
      const data = d.res.json() as {
        pace: { average: number | null; worst: number | null; best: number | null };
      };
      expect(data.pace.average).toBeNull();
      expect(data.pace.worst).toBeNull();
      expect(data.pace.best).toBeNull();
    });
  });

  describe("GET /api/projects/:projectId/parts/:partId/events", () => {
    it("returns 200 + events array", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/projects/proj1/parts/p1/events" });
      await handle(req, res);
      expect(res.statusCode).toBe(200);
      const data = res.json() as unknown[];
      expect(Array.isArray(data)).toBe(true);
    });

    it("returns 404 for part not in project", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({ method: "GET", url: "/api/projects/proj1/parts/q1/events" });
      await handle(req, res);
      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/projects/:projectId/parts/:partId/approve", () => {
    it("returns 404 for missing project", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/nonexistent/parts/p1/approve",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for part not in project", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/q1/approve",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { message: string } };
      expect(data.error.message).toContain("Part not found in project");
    });

    it("returns 404 when approving part from other project", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj2/parts/p1/approve",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { message: string } };
      expect(data.error.message).toContain("Part not found in project");
    });

    it("returns 200 + { events, state } on success", async () => {
      const { handle } = createApp();
      const appr = approve("proj1", "p1");
      await handle(appr.req, appr.res);
      expect(appr.res.statusCode).toBe(200);
      const data = appr.res.json() as { events: unknown[]; state: unknown };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
      expect(data).toHaveProperty("state");
    });
  });

  describe("POST /api/projects/:projectId/parts/:partId/complete", () => {
    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p1/complete",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(200);
      const data = res.json() as { events: unknown[] };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("POST /api/projects/:projectId/parts/:partId/reopen", () => {
    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      await handle(approve("proj1", "p1").req, approve("proj1", "p1").res);
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p1/reopen",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(200);
      const data = res.json() as { events: unknown[] };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("POST /api/projects/:projectId/parts/:partId/snooze", () => {
    it("returns 400 when until missing", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p4/snooze",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(400);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_INPUT");
    });

    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      const snz = snooze("proj1", "p4", { until: "2025-02-25", at: NOW_ISO });
      await handle(snz.req, snz.res);
      expect(snz.res.statusCode).toBe(200);
      const data = snz.res.json() as { events: unknown[] };
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
        url: "/api/projects/proj1/parts/p1/approve",
        body: { at: at1 },
      });
      await handle(r1.req, r1.res);
      expect(r1.res.statusCode).toBe(200);

      const r2 = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p1/reopen",
        body: { at: at2 },
      });
      await handle(r2.req, r2.res);
      expect(r2.res.statusCode).toBe(200);

      const listRes = partEvents("proj1", "p1");
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
