/**
 * Domain validation — assertions and invariants.
 * Framework-independent. No business logic.
 */

/** Throws if condition is falsy. TypeScript narrows after a successful call. */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Same as assert; use for invariants that must always hold. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Call in unreachable branches (e.g. exhaustive switch). Always throws. */
export function neverReached(message = "Unreachable"): never {
  throw new Error(message);
}
