import type { PageWatchEntry, WatchedThread } from "./types.ts";

export const MAX_PINGS_PER_THREAD = 5;

const BUSY_EVENT_TYPES = new Set(["Start", "PermissionRequest"]);

export interface TriggerResult {
	fired: WatchedThread[];
	suppressed: string[];
	firedCursor: number;
	suppressedCursor: number;
	pings: Map<string, number>;
}

export function agentIsBusy(lastEventType: string | undefined): boolean {
	if (lastEventType === undefined) return false;
	return BUSY_EVENT_TYPES.has(lastEventType);
}

function newestHumanComment(thread: WatchedThread): number {
	let newest = 0;
	for (const comment of thread.comments) {
		if (comment.authorKind !== "human") continue;
		const at = comment.createdAt.getTime();
		if (at > newest) newest = at;
	}
	return newest;
}

export function selectThreadsToDeliver(
	threads: WatchedThread[],
	entry: Pick<PageWatchEntry, "cursor" | "pings">,
): TriggerResult {
	const pings = new Map(entry.pings);
	const fired: WatchedThread[] = [];
	const suppressed: string[] = [];
	let firedCursor = 0;
	let suppressedCursor = 0;

	for (const thread of threads) {
		if (thread.resolved) continue;

		const newest = newestHumanComment(thread);
		if (newest <= entry.cursor) continue;

		const seen = pings.get(thread.id) ?? 0;
		if (seen >= MAX_PINGS_PER_THREAD) {
			suppressed.push(thread.id);
			if (newest > suppressedCursor) suppressedCursor = newest;
			continue;
		}

		pings.set(thread.id, seen + 1);
		fired.push(thread);
		if (newest > firedCursor) firedCursor = newest;
	}

	return { fired, suppressed, firedCursor, suppressedCursor, pings };
}
