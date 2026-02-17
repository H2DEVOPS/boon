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

const approve = (projectId: string, partId: string, body?: { at?: string }, headers?: Record<string, string>) =>
  mockReqRes({
    method: "POST",
    url: `/api/projects/${projectId}/parts/${partId}/approve`,
    body: body ?? { at: NOW_ISO },
    headers,
  });

const snooze = (
  projectId: string,
  partId: string,
  body: { until: string; at?: string },
  headers?: Record<string, string>
) =>
  mockReqRes({
    method: "POST",
    url: `/api/projects/${projectId}/parts/${partId}/snooze`,
    body,
    headers,
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

  describe("POST /api/admin/projects/:projectId/snapshot", () => {
    const snapshot = {
      projectId: "proj3",
      title: "New Project",
      stages: [{ id: "sX", title: "Stage X" }],
      parts: [
        {
          partId: "x1",
          endDate: "2025-03-10",
          stageId: "sX",
          title: "Part X1",
          startDate: "2025-03-01",
        },
      ],
      calendar: {
        timezone: "Europe/Stockholm",
        weekendDays: [0, 6],
        overrides: [],
      },
    };

    it("POST snapshot then GET /api/projects lists it", async () => {
      const { handle } = createApp();

      const post = mockReqRes({
        method: "POST",
        url: "/api/admin/projects/proj3/snapshot",
        body: snapshot,
      });
      await handle(post.req, post.res);
      expect(post.res.statusCode).toBe(204);

      const list = mockReqRes({ method: "GET", url: "/api/projects" });
      await handle(list.req, list.res);
      expect(list.res.statusCode).toBe(200);
      const projects = list.res.json() as Array<{ projectId: string; title: string }>;
      const proj3 = projects.find((p) => p.projectId === "proj3");
      expect(proj3).toBeDefined();
      expect(proj3!.title).toBe("New Project");
    });

    it("POST snapshot then GET /api/projects/:projectId/gantt returns same stages/parts", async () => {
      const { handle } = createApp();

      const post = mockReqRes({
        method: "POST",
        url: "/api/admin/projects/proj3/snapshot",
        body: snapshot,
      });
      await handle(post.req, post.res);
      expect(post.res.statusCode).toBe(204);

      const gantt = mockReqRes({ method: "GET", url: "/api/projects/proj3/gantt" });
      await handle(gantt.req, gantt.res);
      expect(gantt.res.statusCode).toBe(200);
      const data = gantt.res.json() as {
        stages: Array<{ id: string }>;
        parts: Array<{ id: string; stageId: string }>;
      };
      expect(data.stages).toHaveLength(1);
      expect(data.stages[0]!.id).toBe("sX");
      expect(data.parts).toHaveLength(1);
      expect(data.parts[0]!.id).toBe("x1");
      expect(data.parts[0]!.stageId).toBe("sX");
    });

    it("mismatch path/body => 400 INVALID_INPUT", async () => {
      const { handle } = createApp();
      const bad = { ...snapshot, projectId: "other" };

      const post = mockReqRes({
        method: "POST",
        url: "/api/admin/projects/proj3/snapshot",
        body: bad,
      });
      await handle(post.req, post.res);
      expect(post.res.statusCode).toBe(400);
      const data = post.res.json() as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_INPUT");
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

    it("returns 200 + { tasks, quality, anomalies, pace, progress } with projectId and now", async () => {
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
        progress: {
          percent: number;
          onTime: number;
          delayed: number;
          early: number;
          notCompleted: number;
        };
      };
      expect(data).toHaveProperty("tasks");
      expect(data).toHaveProperty("quality");
      expect(data).toHaveProperty("anomalies");
      expect(data).toHaveProperty("pace");
      expect(data).toHaveProperty("progress");
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

      const appr = approve("proj1", "p1", undefined, { "x-command-id": "cmd-approve-dashboard" });
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

      const snz = snooze("proj1", "p4", { until: "2025-02-25", at: NOW_ISO }, { "x-command-id": "cmd-snooze-dashboard" });
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
      await handle(approve("proj1", "p1", undefined, { "x-command-id": "cmd-dash-p1" }).req,
        approve("proj1", "p1", undefined, { "x-command-id": "cmd-dash-p1" }).res);
      await handle(approve("proj2", "q1", undefined, { "x-command-id": "cmd-dash-q1" }).req,
        approve("proj2", "q1", undefined, { "x-command-id": "cmd-dash-q1" }).res);

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
        headers: { "x-command-id": "cmd-other" },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(404);
      const data = res.json() as { error: { message: string } };
      expect(data.error.message).toContain("Part not found in project");
    });

    it("returns 200 + { events, state } on success", async () => {
      const { handle } = createApp();
      const appr = approve("proj1", "p1", undefined, { "x-command-id": "cmd-1" });
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
        headers: { "x-command-id": "cmd-complete" },
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
      await handle(approve("proj1", "p1", undefined, { "x-command-id": "cmd-approve" }).req,
        approve("proj1", "p1", undefined, { "x-command-id": "cmd-approve" }).res);
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p1/reopen",
        body: { at: NOW_ISO },
        headers: { "x-command-id": "cmd-reopen" },
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
        headers: { "x-command-id": "cmd-snooze-missing-until" },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(400);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_INPUT");
    });

    it("returns 200 + { events } on success", async () => {
      const { handle } = createApp();
      const snz = snooze("proj1", "p4", { until: "2025-02-25", at: NOW_ISO }, { "x-command-id": "cmd-snooze-success" });
      await handle(snz.req, snz.res);
      expect(snz.res.statusCode).toBe(200);
      const data = snz.res.json() as { events: unknown[] };
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("idempotent commands", () => {
    it("same commandId twice → events written once", async () => {
      const { handle } = createApp();
      const cmdId = "cmd-idempotent-1";

      const first = approve("proj1", "p1", undefined, { "x-command-id": cmdId });
      await handle(first.req, first.res);
      expect(first.res.statusCode).toBe(200);

      const second = approve("proj1", "p1", undefined, { "x-command-id": cmdId });
      await handle(second.req, second.res);
      expect(second.res.statusCode).toBe(204);

      const eventsRes = partEvents("proj1", "p1");
      await handle(eventsRes.req, eventsRes.res);
      expect(eventsRes.res.statusCode).toBe(200);
      const events = eventsRes.res.json() as Array<{ type: string }>;
      expect(events.filter((e) => e.type === "PartApproved")).toHaveLength(1);
    });

    it("different commandId → events written twice", async () => {
      const { handle } = createApp();

      const first = approve("proj1", "p1", undefined, { "x-command-id": "cmd-a" });
      await handle(first.req, first.res);
      expect(first.res.statusCode).toBe(200);

      const second = approve("proj1", "p2", undefined, { "x-command-id": "cmd-b" });
      await handle(second.req, second.res);
      expect(second.res.statusCode).toBe(200);

      const eventsP1 = partEvents("proj1", "p1");
      await handle(eventsP1.req, eventsP1.res);
      expect(eventsP1.res.statusCode).toBe(200);
      const e1 = eventsP1.res.json() as Array<{ type: string }>;

      const eventsP2 = partEvents("proj1", "p2");
      await handle(eventsP2.req, eventsP2.res);
      expect(eventsP2.res.statusCode).toBe(200);
      const e2 = eventsP2.res.json() as Array<{ type: string }>;

      expect(e1.filter((e) => e.type === "PartApproved")).toHaveLength(1);
      expect(e2.filter((e) => e.type === "PartApproved")).toHaveLength(1);
    });

    it("missing commandId → 400 INVALID_INPUT", async () => {
      const { handle } = createApp();
      const { req, res } = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p1/approve",
        body: { at: NOW_ISO },
      });
      await handle(req, res);
      expect(res.statusCode).toBe(400);
      const data = res.json() as { error: { code: string } };
      expect(data.error.code).toBe("INVALID_INPUT");
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
        headers: { "x-command-id": "cmd-order-1" },
      });
      await handle(r1.req, r1.res);
      expect(r1.res.statusCode).toBe(200);

      const r2 = mockReqRes({
        method: "POST",
        url: "/api/projects/proj1/parts/p1/reopen",
        body: { at: at2 },
        headers: { "x-command-id": "cmd-order-2" },
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
