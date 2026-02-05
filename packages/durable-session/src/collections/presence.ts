/**
 * Aggregated presence collection - derived from raw per-device presence.
 *
 * The raw presence from stream-db tracks each (actorId, deviceId) pair.
 * This collection aggregates devices per actor, filtering for online status,
 * to provide a simple "who's online" view.
 *
 * Note: The upstream @tanstack/db `collect` aggregate is not yet published.
 * Instead, we use groupBy + count as a change discriminator, then
 * imperatively gather device IDs inside fn.select.
 */

import type { Collection } from "@tanstack/db";
import { count, createLiveQueryCollection, eq } from "@tanstack/db";
import type { PresenceRow, RawPresenceRow } from "../schema";

// ============================================================================
// Aggregated Presence Collection
// ============================================================================

/**
 * Options for creating an aggregated presence collection.
 */
export interface PresenceCollectionOptions {
	/** Session identifier */
	sessionId: string;
	/** Raw presence collection from stream-db (per-device records) */
	rawPresenceCollection: Collection<RawPresenceRow>;
}

/**
 * Creates the aggregated presence collection.
 *
 * Uses a live query pipeline to:
 * 1. Filter raw presence for status='online'
 * 2. Group by actorId
 * 3. Use fn.select to imperatively collect device IDs
 *
 * The result is one row per online actor, with their device count.
 */
export function createPresenceCollection(
	options: PresenceCollectionOptions,
): Collection<PresenceRow> {
	const { rawPresenceCollection } = options;

	return createLiveQueryCollection({
		query: (q) => {
			// Subquery: filter for online, group by actorId, count for change detection
			const grouped = q
				.from({ presence: rawPresenceCollection })
				.where(({ presence }) => eq(presence.status, "online"))
				.groupBy(({ presence }) => presence.actorId)
				.select(({ presence }) => ({
					actorId: presence.actorId,
					deviceCount: count(presence.deviceId),
				}));

			// Main query: imperatively gather device info per actor
			return q.from({ grouped }).fn.select(({ grouped }) => {
				// Get all online presence rows for this actor
				const actorPresence = [...rawPresenceCollection.values()].filter(
					(p) =>
						(p as RawPresenceRow).actorId === grouped.actorId &&
						(p as RawPresenceRow).status === "online",
				) as RawPresenceRow[];

				const first = actorPresence[0];
				return {
					actorId: grouped.actorId as string,
					actorType: (first?.actorType ?? "user") as "user" | "agent",
					name: first?.name,
					deviceIds: actorPresence.map((p) => p.deviceId),
					deviceCount: actorPresence.length,
				};
			});
		},
		startSync: true,
	});
}
