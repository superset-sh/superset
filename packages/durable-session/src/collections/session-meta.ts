/**
 * Session metadata collection - local state collection.
 *
 * Tracks connection state and sync progress.
 * This is a local-only collection, not derived from stream.
 */

import { localOnlyCollectionOptions } from "@tanstack/db";
import type { ConnectionStatus, SessionMetaRow } from "../types";

/**
 * Options for creating a session meta collection.
 */
export interface SessionMetaCollectionOptions {
	/** Session identifier */
	sessionId: string;
}

/**
 * Creates collection config for the session metadata collection.
 *
 * This collection stores local state:
 * - connectionStatus
 * - lastSyncedOffset
 * - lastSyncedAt
 * - error
 *
 * The collection is a single-row collection keyed by sessionId.
 *
 * @example
 * ```typescript
 * import { createSessionMetaCollectionOptions } from '@superset/durable-session'
 * import { createCollection } from '@tanstack/db'
 *
 * const sessionMetaCollection = createCollection(
 *   createSessionMetaCollectionOptions({
 *     sessionId: 'my-session',
 *   })
 * )
 * ```
 */
export function createSessionMetaCollectionOptions(
	options: SessionMetaCollectionOptions,
) {
	const { sessionId } = options;

	return localOnlyCollectionOptions<SessionMetaRow>({
		id: `session-meta:${sessionId}`,
		getKey: (meta) => meta.sessionId,
	});
}

/**
 * Create initial session metadata.
 *
 * @param sessionId - Session identifier
 * @returns Initial session metadata row
 */
export function createInitialSessionMeta(sessionId: string): SessionMetaRow {
	return {
		sessionId,
		connectionStatus: "disconnected",
		lastSyncedTxId: null,
		lastSyncedAt: null,
		error: null,
	};
}

/**
 * Update session metadata with new connection status.
 *
 * @param meta - Current metadata
 * @param status - New connection status
 * @param error - Optional error information
 * @returns Updated metadata
 */
export function updateConnectionStatus(
	meta: SessionMetaRow,
	status: ConnectionStatus,
	error?: { message: string; code?: string } | null,
): SessionMetaRow {
	return {
		...meta,
		connectionStatus: status,
		error: error ?? (status === "connected" ? null : meta.error),
	};
}

/**
 * Update session metadata with sync progress.
 *
 * @param meta - Current metadata
 * @param txId - Last synced transaction ID
 * @returns Updated metadata
 */
export function updateSyncProgress(
	meta: SessionMetaRow,
	txId: string,
): SessionMetaRow {
	return {
		...meta,
		lastSyncedTxId: txId,
		lastSyncedAt: new Date(),
		connectionStatus: "connected",
		error: null,
	};
}
