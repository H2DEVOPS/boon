/**
 * Pure HTTP request handler. No server/listen.
 * Injected deps for testability.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore } from "../domain/eventStore.js";
import type { ProjectCalendar } from "../domain/calendar.js";
import type { PartBase } from "../domain/projections.js";
import { approvePart, completePart, snoozePart, reopenPart } from "../domain/partLifecycle.js";
import { projectDashboardState, projectPartState } from "../domain/projections.js";
import { asTimestamp } from "../domain/core.js";
import { InvariantViolation } from "../domain/errors.js";
import type { PartLifecycleEvent } from "../domain/events.js";
import type { DomainEventUnion } from "../domain/events.js";

const API = "/api";

export interface HandlerDeps {
  eventStore: EventStore;
  calendar: ProjectCalendar;
  clock: { now: () => number; timezone: string };
  parts: readonly PartBase[];
  /** Optional logger; no-op if absent. */
  logger?: { error: (err: unknown) => void };
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
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
    const method = req.method ?? "GET";

    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (method === "GET" && pathname === `${API}/events`) {
      const events = await deps.eventStore.loadAll();
      sendJson(res, 200, events);
      return;
    }

    const eventsPartMatch = pathname.match(new RegExp(`^${API}/events/([^/]+)$`));
    if (method === "GET" && eventsPartMatch) {
      const partId = decodeURIComponent(eventsPartMatch[1] ?? "");
      const events = await deps.eventStore.loadByPart(partId);
      sendJson(res, 200, events);
      return;
    }

    if (method === "POST" && pathname === `${API}/events`) {
      try {
        const body = (await parseBody(req)) as DomainEventUnion;
        if (
          !body ||
          typeof body !== "object" ||
          !("type" in body) ||
          !("partId" in body) ||
          !("timestamp" in body)
        ) {
          sendJson(res, 400, { error: "Invalid event: need type, partId, timestamp" });
          return;
        }
        const e = body as DomainEventUnion;
        await deps.eventStore.append([e]);
        sendJson(res, 201, e);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
      }
      return;
    }

    const approveMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/approve$`));
    if (method === "POST" && approveMatch) {
      const partId = decodeURIComponent(approveMatch[1] ?? "");
      try {
        const body = (await parseBody(req)) as { timestamp?: number };
        const ts =
          body?.timestamp != null
            ? asTimestamp(Number(body.timestamp))
            : asTimestamp(deps.clock.now());
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = approvePart(events, partId, ts);
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        const all = await deps.eventStore.loadAll();
        const part = deps.parts.find((p) => p.partId === partId);
        const projection = part
          ? projectPartState(
              getPartLifecycleEvents(all),
              partId,
              part.endDate,
              ts,
              deps.clock.timezone,
              deps.calendar
            )
          : null;
        sendJson(res, 200, { events: delta, state: projection });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendJson(res, 409, { error: err.message });
        } else {
          sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
        }
      }
      return;
    }

    const completeMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/complete$`));
    if (method === "POST" && completeMatch) {
      const partId = decodeURIComponent(completeMatch[1] ?? "");
      try {
        const body = (await parseBody(req)) as { timestamp?: number };
        const ts =
          body?.timestamp != null
            ? asTimestamp(Number(body.timestamp))
            : asTimestamp(deps.clock.now());
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = completePart(events, partId, ts);
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        sendJson(res, 200, { events: delta });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendJson(res, 409, { error: err.message });
        } else {
          sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
        }
      }
      return;
    }

    const reopenMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/reopen$`));
    if (method === "POST" && reopenMatch) {
      const partId = decodeURIComponent(reopenMatch[1] ?? "");
      try {
        const body = (await parseBody(req)) as { timestamp?: number };
        const ts =
          body?.timestamp != null
            ? asTimestamp(Number(body.timestamp))
            : asTimestamp(deps.clock.now());
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = reopenPart(events, partId, ts);
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        sendJson(res, 200, { events: delta });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendJson(res, 409, { error: err.message });
        } else {
          sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
        }
      }
      return;
    }

    const snoozeMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/snooze$`));
    if (method === "POST" && snoozeMatch) {
      const partId = decodeURIComponent(snoozeMatch[1] ?? "");
      try {
        const body = (await parseBody(req)) as { timestamp?: number; notificationDate?: string };
        const ts =
          body?.timestamp != null
            ? asTimestamp(Number(body.timestamp))
            : asTimestamp(deps.clock.now());
        const notificationDate = body?.notificationDate;
        if (typeof notificationDate !== "string") {
          sendJson(res, 400, { error: "notificationDate required" });
          return;
        }
        const events = getPartLifecycleEvents(await deps.eventStore.loadByPart(partId));
        const next = snoozePart(events, partId, notificationDate, ts);
        const delta = next.slice(events.length);
        await deps.eventStore.append(delta);
        sendJson(res, 200, { events: delta });
      } catch (err) {
        if (err instanceof InvariantViolation) {
          sendJson(res, 409, { error: err.message });
        } else {
          sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
        }
      }
      return;
    }

    if (method === "GET" && pathname === `${API}/dashboard`) {
      const url = new URL(req.url ?? "", `http://${req.headers?.host ?? "localhost"}`);
      const nowMs = url.searchParams.get("now");
      const now = nowMs ? asTimestamp(Number(nowMs)) : asTimestamp(deps.clock.now());
      const events = await deps.eventStore.loadAll();
      const tasks = projectDashboardState(
        deps.parts,
        getPartLifecycleEvents(events),
        now,
        deps.clock.timezone,
        deps.calendar
      );
      sendJson(res, 200, { tasks, quality: [], anomalies: [] });
      return;
    }

    sendJson(res, 404, { error: "Not Found" });
  };
}
