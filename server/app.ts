/**
 * HTTP server wiring — creates handler + server.
 * No business logic; handler lives in handler.ts.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import { createHandler, type HandlerDeps, type RequestHandler } from "./handler.js";
import { eventStore, calendar } from "./deps.js";
import { createMockProjectRepo, createMockPartRepo } from "./mockRepos.js";
import { apiError } from "./apiErrors.js";

export interface AppOptions {
  deps?: Partial<HandlerDeps>;
}

function defaultDeps(): HandlerDeps {
  return {
    eventStore,
    projectRepo: createMockProjectRepo(),
    partRepo: createMockPartRepo(),
    calendar,
    clock: { now: () => Date.now(), timezone: "Europe/Stockholm" },
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
      res.end(JSON.stringify(apiError("INTERNAL_ERROR", "Internal Server Error")));
    }
  };

  const server = createServer(wrappedHandle);

  return { handle: wrappedHandle, server };
}
