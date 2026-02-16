/**
 * Domain error model — base and concrete error types.
 * Framework-independent. No business logic.
 */

/** Optional metadata attached to domain errors. */
export type ErrorMetadata = Record<string, unknown>;

/** Base for all domain errors. Preserves prototype chain for instanceof. */
export class DomainError extends Error {
  readonly metadata: ErrorMetadata | undefined;

  constructor(message: string, metadata?: ErrorMetadata) {
    super(message);
    this.name = this.constructor.name;
    this.metadata = metadata;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a value or input fails validation. */
export class ValidationError extends DomainError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super(message, metadata);
  }
}

/** Thrown when an invariant is violated. */
export class InvariantViolation extends DomainError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super(message, metadata);
  }
}

/** Thrown when an entity or resource is not found. */
export class NotFoundError extends DomainError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super(message, metadata);
  }
}
