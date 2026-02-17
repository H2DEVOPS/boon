/**
 * Server dependencies — event store selection.
 * Swap to DB or file without touching domain/handler.
 */

import path from "node:path";
import { InMemoryProjectEventStore } from "../domain/eventStore.js";
import type { EventStore } from "../domain/eventStore.js";
import type { ProjectRepo } from "../domain/repositories.js";
import { FileProjectEventStore } from "./fileEventStore.js";
import { FileProjectSnapshotRepo } from "./fileProjectSnapshotRepo.js";
import { createMockProjectRepo } from "./mockRepos.js";

function createEventStore(): EventStore {
  if (process.env.EVENT_STORE === "file") {
    const dir = process.env.EVENT_STORE_DIR ?? "./data";
    const rootDir = path.resolve(dir);
    return new FileProjectEventStore(rootDir);
  }
  return new InMemoryProjectEventStore();
}

function createProjectRepo(): ProjectRepo {
  if (process.env.PROJECT_STORE === "memory") {
    return createMockProjectRepo();
  }
  const dir = process.env.PROJECT_STORE_DIR ?? "./data/projects";
  const rootDir = path.resolve(dir);
  // Use snapshot-backed repo for file storage (default in dev).
  return new FileProjectSnapshotRepo(rootDir);
}

const store = createEventStore();
export const eventStore: EventStore = store;
export const projectRepo: ProjectRepo = createProjectRepo();

/** Reset event store for tests (only supported for in-memory adapter). */
export function resetEventStore(): void {
  if (store instanceof InMemoryProjectEventStore) {
    store.clear();
  }
}

