/**
 * HTTP server wiring — creates handler + server.
 * No business logic; handler lives in handler.ts.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import { createHandler, type HandlerDeps, type RequestHandler } from "./handler.js";
import { eventStore, calendar } from "./deps.js";

const MOCK_PARTS = [
  { partId: "p1", endDate: "2025-02-17" },
  { partId: "p2", endDate: "2025-02-18" },
  { partId: "p3", endDate: "2025-02-20" },
  { partId: "p4", endDate: "2025-02-17" },
];

export interface AppOptions {
  deps?: Partial<HandlerDeps>;
}

function defaultDeps(): HandlerDeps {
  return {
    eventStore,
    calendar,
    clock: { now: () => Date.now(), timezone: "Europe/Stockholm" },
    parts: MOCK_PARTS,
    logger: { error: (err) => console.error(err) },
  };
}

export function createApp(options?: AppOptions): {
  handle: RequestHandler;
  server: Server;
} {
  const deps: HandlerDeps = { ...defaultDeps(), ...options?.deps };
  const handle = createHandler(deps);

  const wrappedHandle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handle(req, res);
    } catch (err) {
      deps.logger?.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  };

  const server = createServer(wrappedHandle);

  return { handle: wrappedHandle, server };
}
