/**
 * Normalize IDs for filesystem usage.
 * Allows only [a-zA-Z0-9._-], replaces others with '_'.
 */

export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

