/**
 * File-backed ProjectSnapshot repository.
 * Thin wrapper around FileProjectRepo for clarity of intent.
 */

import { FileProjectRepo } from "./fileProjectRepo.js";
import type { ProjectRepo } from "../domain/repositories.js";

export class FileProjectSnapshotRepo extends FileProjectRepo implements ProjectRepo {}

