/**
 * Command metadata for idempotent command handling.
 */

import type { Brand } from "./core.js";

/** Opaque command identifier. */
export type CommandId = Brand<string, "CommandId">;

/** Metadata that can be attached to a command. */
export interface CommandMeta {
  readonly commandId: CommandId;
  readonly timestamp: number;
}

