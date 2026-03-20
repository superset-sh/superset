import { EventEmitter } from "node:events";

/**
 * Emits when shared data changes (projects, workspaces, etc.) so that
 * other windows can invalidate their query caches.
 */
export const dataEmitter = new EventEmitter();
