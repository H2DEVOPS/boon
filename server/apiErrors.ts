/**
 * API error model — standard payload shape.
 * Maps domain/validation errors to HTTP codes.
 */

export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "INTERNAL_ERROR";

export interface ApiErrorPayload {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

export function apiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiErrorPayload {
  return { error: { code, message, ...(details != null && { details }) } };
}
