/**
 * Test utils — mock HTTP req/res without sockets.
 * Enables deterministic handler tests with no network.
 */

import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface MockReqOptions {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface MockedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  /** Parsed JSON body when Content-Type is application/json. */
  json<T = unknown>(): T;
}

export function mockReq(opts: MockReqOptions = {}): IncomingMessage {
  const bodyStr =
    opts.body !== undefined ? JSON.stringify(opts.body) : "";
  const stream = Readable.from([bodyStr]);
  const rawHeaders = opts.headers ?? {};
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    lowerHeaders[k.toLowerCase()] = v;
  }
  return Object.assign(stream, {
    method: opts.method ?? "GET",
    url: opts.url ?? "/",
    headers: lowerHeaders,
  }) as unknown as IncomingMessage;
}

export function mockRes(): ServerResponse & MockedResponse {
  let statusCode = 0;
  const headers: Record<string, string> = {};
  let body = "";

  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(code: number, h?: Record<string, string | string[]>) {
      statusCode = code;
      if (h) {
        for (const [k, v] of Object.entries(h)) {
          headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        }
      }
    },
    end(chunk?: string | Buffer) {
      body = chunk ? (typeof chunk === "string" ? chunk : chunk.toString()) : "";
    },
    get statusCodeOut() {
      return statusCode;
    },
    get headersOut() {
      return { ...headers };
    },
    get bodyOut() {
      return body;
    },
    json<T = unknown>(): T {
      return JSON.parse(body) as T;
    },
  } as unknown as ServerResponse & MockedResponse;

  // ServerResponse expects write/end etc; we only need writeHead + end
  Object.assign(res, {
    write: () => false,
    setHeader: () => res,
    getHeader: () => undefined,
  });

  // Override getters so tests can read captured values
  Object.defineProperties(res, {
    statusCode: {
      get: () => statusCode,
      configurable: true,
    },
    headers: {
      get: () => ({ ...headers }),
      configurable: true,
    },
    body: {
      get: () => body,
      configurable: true,
    },
  });

  return res;
}

export interface MockReqResResult {
  req: IncomingMessage;
  res: ServerResponse & MockedResponse;
}

export function mockReqRes(opts: MockReqOptions = {}): MockReqResResult {
  return {
    req: mockReq(opts),
    res: mockRes(),
  };
}
