/**
 * Minimal HTTP server — Node native http, no framework.
 * No business logic.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const HEALTH_PATH = "/health";
const HEALTH_RESPONSE = { status: "ok" } as const;

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
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

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const pathname = getPathname(req.url, req.headers.host);
  const method = req.method ?? "GET";

  if (method === "GET" && pathname === HEALTH_PATH) {
    sendJson(res, 200, HEALTH_RESPONSE);
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
});

const PORT = 3_000;
server.listen(PORT, () => {
  console.info(`Server listening on http://localhost:${PORT}`);
});
