/**
 * Pure HTTP request handler. No server/listen.
 * Injected deps for testability. No domain imports node:http.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore } from "../domain/eventStore.js";
import type { ProjectCalendar } from "../domain/calendar.js";
import type { ProjectRepo, PartRepo } from "../domain/repositories.js";
import { approvePart, completePart, snoozePart, reopenPart } from "../domain/partLifecycle.js";
import { projectDashboardState, projectPartState } from "../domain/projections.js";
import { asTimestamp } from "../domain/core.js";
import { InvariantViolation } from "../domain/errors.js";
import type { PartLifecycleEvent } from "../domain/events.js";
import type { DomainEventUnion } from "../domain/events.js";
import { apiError, type ErrorCode } from "./apiErrors.js";

const API = "/api";

export interface HandlerDeps {
  eventStore: EventStore;
  projectRepo: ProjectRepo;
  partRepo: PartRepo;
  calendar: ProjectCalendar;
  clock: { now: () => number; timezone: string };
  logger?: { error: (err: unknown) => void };
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, statusCode: number, code: ErrorCode, message: string, details?: Record<string, unknown>): void {
  sendJson(res, statusCode, apiError(code, message, details));
}

function getPathname(url: string | undefined, host: string | undefined): string {
  if (url === undefined) return "/";
  try {
    const base = host !== undefined ? `http://${host}` : "http://localhost";
    return new URL(url, base).pathname;
  } catch {
    return "/";
  }
}

function getQuery(url: string | undefined, host: string | undefined): URLSearchParams {
  if (url === undefined) return new URLSearchParams();
  try {
    const base = host !== undefined ? `http://${host}` : "http://localhost";
    return new URL(url, base).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer | string) => {
      body += typeof chunk === "string" ? chunk : chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Parse ISO string to ms. Returns NaN if invalid. */
function parseIsoToMs(iso: string | undefined): number | null {
  if (iso == null || typeof iso !== "string") return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getPartLifecycleEvents(events: DomainEventUnion[]): PartLifecycleEvent[] {
  return events.filter(
    (e): e is PartLifecycleEvent =>
      e.type === "PartApproved" ||
      e.type === "PartSnoozed" ||
      e.type === "PartCompleted" ||
      e.type === "PartReopened"
  );
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function createHandler(deps: HandlerDeps): RequestHandler {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = getPathname(req.url, req.headers?.host as string | undefined);
    const query = getQuery(req.url, req.headers?.host as string | undefined);
    const method = req.method ?? "GET";

    // --- Health ---
    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    // --- GET /api/projects ---
    if (method === "GET" && pathname === `${API}/projects`) {
      const projects = await deps.projectRepo.listProjects();
      sendJson(res, 200, projects);
      return;
    }

    // --- GET /api/projects/:projectId/gantt ---
    const ganttMatch = pathname.match(new RegExp(`^${API}/projects/([^/]+)/gantt$`));
    if (method === "GET" && ganttMatch) {
      const projectId = decodeURIComponent(ganttMatch[1] ?? "");
      const project = await deps.projectRepo.getProject(projectId);
      if (!project) {
        sendError(res, 404, "NOT_FOUND", "Project not found", { projectId });
        return;
      }
      sendJson(res, 200, { stages: project.stages, parts: project.parts });
      return;
    }

    // --- GET /api/dashboard?projectId=...&now=ISO ---
    if (method === "GET" && pathname === `${API}/dashboard`) {
      const projectId = query.get("projectId");
      if (!projectId) {
        sendError(res, 400, "INVALID_INPUT", "projectId required");
        return;
      }
      const parts = await deps.partRepo.listPartsByProject(projectId);
      const nowParam = query.get("now");
      const ts = asTimestamp(nowParam != null ? (parseIsoToMs(nowParam) ?? deps.clock.now()) : deps.clock.now());
      const events = await deps.eventStore.loadAll();
      const lifecycleEvents = getPartLifecycleEvents(events);
      const tasks = projectDashboardState(parts, lifecycleEvents, ts, deps.clock.timezone, deps.calendar);
      const pace = {};
      sendJson(res, 200, { tasks, quality: [], anomalies: [], pace });
      return;
    }

    // --- GET /api/parts/:partId/events ---
    const partEventsMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/events$`));
    if (method === "GET" && partEventsMatch) {
      const partId = decodeURIComponent(partEventsMatch[1] ?? "");
      const events = await deps.eventStore.loadByPart(partId);
      sendJson(res, 200, events);
      return;
    }

    // --- POST /api/parts/:partId/approve ---
    const approveMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/approve$`));
    if (method === "POST" && approveMatch) {
      const partId = decodeURIComponent(approveMatch[1] ?? "");
      const part = await deps.partRepo.getPart(partId);
      if (!part) {
        sendError(res, 404, "NOT_FOUND", "Part not found", { partId });
        return;
      }
      try {
        const body = (await parseBody(req)) as { at?: string };
        const ts = parseIsoToMs(body?.at) ?? deps.clock.now();
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = approvePart(events, partId, asTimestamp(ts));
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        const all = await deps.eventStore.loadAll();
        const projection = projectPartState(
          getPartLifecycleEvents(all),
          partId,
          part.endDate,
          asTimestamp(ts),
          deps.clock.timezone,
          deps.calendar
        );
        sendJson(res, 200, { events: delta, state: projection });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendError(res, 409, "INVALID_TRANSITION", err.message, err.metadata as Record<string, unknown> | undefined);
        } else {
          sendError(res, 400, "INVALID_INPUT", err instanceof Error ? err.message : "Bad request");
        }
      }
      return;
    }

    // --- POST /api/parts/:partId/complete ---
    const completeMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/complete$`));
    if (method === "POST" && completeMatch) {
      const partId = decodeURIComponent(completeMatch[1] ?? "");
      const part = await deps.partRepo.getPart(partId);
      if (!part) {
        sendError(res, 404, "NOT_FOUND", "Part not found", { partId });
        return;
      }
      try {
        const body = (await parseBody(req)) as { at?: string };
        const ts = parseIsoToMs(body?.at) ?? deps.clock.now();
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = completePart(events, partId, asTimestamp(ts));
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        sendJson(res, 200, { events: delta });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendError(res, 409, "INVALID_TRANSITION", err.message, err.metadata as Record<string, unknown> | undefined);
        } else {
          sendError(res, 400, "INVALID_INPUT", err instanceof Error ? err.message : "Bad request");
        }
      }
      return;
    }

    // --- POST /api/parts/:partId/reopen ---
    const reopenMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/reopen$`));
    if (method === "POST" && reopenMatch) {
      const partId = decodeURIComponent(reopenMatch[1] ?? "");
      const part = await deps.partRepo.getPart(partId);
      if (!part) {
        sendError(res, 404, "NOT_FOUND", "Part not found", { partId });
        return;
      }
      try {
        const body = (await parseBody(req)) as { at?: string };
        const ts = parseIsoToMs(body?.at) ?? deps.clock.now();
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = reopenPart(events, partId, asTimestamp(ts));
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        sendJson(res, 200, { events: delta });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendError(res, 409, "INVALID_TRANSITION", err.message, err.metadata as Record<string, unknown> | undefined);
        } else {
          sendError(res, 400, "INVALID_INPUT", err instanceof Error ? err.message : "Bad request");
        }
      }
      return;
    }

    // --- POST /api/parts/:partId/snooze { until: DateKey, at?: ISO } ---
    const snoozeMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/snooze$`));
    if (method === "POST" && snoozeMatch) {
      const partId = decodeURIComponent(snoozeMatch[1] ?? "");
      const part = await deps.partRepo.getPart(partId);
      if (!part) {
        sendError(res, 404, "NOT_FOUND", "Part not found", { partId });
        return;
      }
      try {
        const body = (await parseBody(req)) as { until?: string; at?: string };
        const until = body?.until;
        if (typeof until !== "string") {
          sendError(res, 400, "INVALID_INPUT", "until (DateKey) required");
          return;
        }
        const ts = parseIsoToMs(body?.at) ?? deps.clock.now();
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = snoozePart(events, partId, until, asTimestamp(ts));
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        sendJson(res, 200, { events: delta });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendError(res, 409, "INVALID_TRANSITION", err.message, err.metadata as Record<string, unknown> | undefined);
        } else {
          sendError(res, 400, "INVALID_INPUT", err instanceof Error ? err.message : "Bad request");
        }
      }
      return;
    }

    sendError(res, 404, "NOT_FOUND", "Not Found");
  };
}
