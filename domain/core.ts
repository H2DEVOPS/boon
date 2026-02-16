/**
 * Domain core — structural primitives only.
 * Framework-independent. No business assumptions.
 */

// --- Identity ---

/** Opaque identifier for an entity. Generic over underlying representation. */
export type EntityId<T = string> = T & { readonly __entityId: unique symbol };

// --- Base object ---

/** Minimal domain object: has an identity. */
export interface DomainObject<Id = EntityId> {
  readonly id: Id;
}

// --- Branded scalars (safer than plain numbers) ---

export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Point in time (UTC epoch milliseconds). */
export type Timestamp = Brand<number, "TimestampMs">;

/** Logical time: sequence or version number. */
export type LogicalTime = Brand<number, "LogicalTime">;

/** Span of time (milliseconds). */
export type Duration = Brand<number, "DurationMs">;

// --- Constructors (no validation yet) ---

export const asTimestamp = (ms: number) => ms as Timestamp;
export const asLogicalTime = (n: number) => n as LogicalTime;
export const asDuration = (ms: number) => ms as Duration;

// --- Relation ---

/** Generic relation between two entities. */
export interface Relation<FromId = EntityId, ToId = EntityId, Kind = string> {
  readonly fromId: FromId;
  readonly toId: ToId;
  readonly kind?: Kind;
}