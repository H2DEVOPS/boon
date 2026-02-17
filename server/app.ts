/**
 * HTTP request handler — routes for event store, commands, projections.
 * No business logic in routing; delegates to domain.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import { eventStore, calendar } from "./deps.js";
import { approvePart, completePart, snoozePart, reopenPart } from "../domain/partLifecycle.js";
import { projectDashboardState, projectPartState } from "../domain/projections.js";
import { asTimestamp } from "../domain/core.js";
import { InvariantViolation } from "../domain/errors.js";
import type { PartLifecycleEvent } from "../domain/events.js";
import type { DomainEventUnion } from "../domain/events.js";

const API = "/api";

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
    req.on("data", (chunk) => { body += chunk; });
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

/** Mock parts until part-repo exists. */
const MOCK_PARTS = [
  { partId: "p1", endDate: "2025-02-17" },
  { partId: "p2", endDate: "2025-02-18" },
  { partId: "p3", endDate: "2025-02-20" },
  { partId: "p4", endDate: "2025-02-17" },
];

function getPartLifecycleEvents(events: DomainEventUnion[]): PartLifecycleEvent[] {
  return events.filter(
    (e): e is PartLifecycleEvent =>
      e.type === "PartApproved" || e.type === "PartSnoozed" || e.type === "PartCompleted" || e.type === "PartReopened"
  );
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = getPathname(req.url, req.headers.host);
  const method = req.method ?? "GET";

  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  // GET /api/events
  if (method === "GET" && pathname === `${API}/events`) {
    const events = await eventStore.loadAll();
    sendJson(res, 200, events);
    return;
  }

  // GET /api/events/:partId
  const eventsPartMatch = pathname.match(new RegExp(`^${API}/events/([^/]+)$`));
  if (method === "GET" && eventsPartMatch) {
    const partId = decodeURIComponent(eventsPartMatch[1] ?? "");
    const events = await eventStore.loadByPart(partId);
    sendJson(res, 200, events);
    return;
  }

  // POST /api/events (free append, dev)
  if (method === "POST" && pathname === `${API}/events`) {
    try {
      const body = (await parseBody(req)) as DomainEventUnion;
      if (!body || typeof body !== "object" || !("type" in body) || !("partId" in body) || !("timestamp" in body)) {
        sendJson(res, 400, { error: "Invalid event: need type, partId, timestamp" });
        return;
      }
      const e = body as DomainEventUnion;
      await eventStore.append([e]);
      sendJson(res, 201, e);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
    }
    return;
  }

  // POST /api/parts/:partId/approve
  const approveMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/approve$`));
  if (method === "POST" && approveMatch) {
    const partId = decodeURIComponent(approveMatch[1] ?? "");
    try {
      const body = (await parseBody(req)) as { timestamp?: number };
      const ts = body?.timestamp != null ? asTimestamp(Number(body.timestamp)) : asTimestamp(Date.now());
      const events = getPartLifecycleEvents(await eventStore.loadByPart(partId));
      const next = approvePart(events, partId, ts);
      const delta = next.slice(events.length);
      await eventStore.append(delta);
      const all = await eventStore.loadAll();
      const part = MOCK_PARTS.find((p) => p.partId === partId);
      const projection = part
        ? projectPartState(getPartLifecycleEvents(all), partId, part.endDate, ts, "Europe/Stockholm", calendar)
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

  // POST /api/parts/:partId/complete
  const completeMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/complete$`));
  if (method === "POST" && completeMatch) {
    const partId = decodeURIComponent(completeMatch[1] ?? "");
    try {
      const body = (await parseBody(req)) as { timestamp?: number };
      const ts = body?.timestamp != null ? asTimestamp(Number(body.timestamp)) : asTimestamp(Date.now());
      const events = getPartLifecycleEvents(await eventStore.loadByPart(partId));
      const next = completePart(events, partId, ts);
      const delta = next.slice(events.length);
      await eventStore.append(delta);
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

  // POST /api/parts/:partId/reopen
  const reopenMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/reopen$`));
  if (method === "POST" && reopenMatch) {
    const partId = decodeURIComponent(reopenMatch[1] ?? "");
    try {
      const body = (await parseBody(req)) as { timestamp?: number };
      const ts = body?.timestamp != null ? asTimestamp(Number(body.timestamp)) : asTimestamp(Date.now());
      const events = getPartLifecycleEvents(await eventStore.loadByPart(partId));
      const next = reopenPart(events, partId, ts);
      const delta = next.slice(events.length);
      await eventStore.append(delta);
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

  // POST /api/parts/:partId/snooze
  const snoozeMatch = pathname.match(new RegExp(`^${API}/parts/([^/]+)/snooze$`));
  if (method === "POST" && snoozeMatch) {
    const partId = decodeURIComponent(snoozeMatch[1] ?? "");
    try {
      const body = (await parseBody(req)) as { timestamp?: number; notificationDate?: string };
      const ts = body?.timestamp != null ? asTimestamp(Number(body.timestamp)) : asTimestamp(Date.now());
      const notificationDate = body?.notificationDate;
      if (typeof notificationDate !== "string") {
        sendJson(res, 400, { error: "notificationDate required" });
        return;
      }
      const events = getPartLifecycleEvents(await eventStore.loadByPart(partId));
      const next = snoozePart(events, partId, notificationDate, ts);
      const delta = next.slice(events.length);
      await eventStore.append(delta);
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

  // GET /api/dashboard (query ?now=ms for deterministic tests)
  if (method === "GET" && pathname === `${API}/dashboard`) {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const nowMs = url.searchParams.get("now");
    const now = nowMs ? asTimestamp(Number(nowMs)) : asTimestamp(Date.now());
    const events = await eventStore.loadAll();
    const timezone = "Europe/Stockholm";
    const tasks = projectDashboardState(
      MOCK_PARTS,
      getPartLifecycleEvents(events),
      now,
      timezone,
      calendar
    );
    sendJson(res, 200, { tasks, quality: [], anomalies: [] });
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
}

/** Create HTTP server for use with supertest or listen. */
export function createApp(): Server {
  return createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    });
  });
}
