import type { PageWatchEntry, WatchedThread } from "./types.ts";

export const MAX_PINGS_PER_THREAD = 5;
export const MAX_COMMENTS_PER_DELIVERY = 1000;
const BUSY_EVENT_TYPES = new Set(["Start", "PermissionRequest"]);

export interface TriggerResult {
	fired: WatchedThread[];
	suppressed: string[];
	commentIds: string[];
	pings: Map<string, number>;
}

export function agentIsBusy(lastEventType: string | undefined): boolean {
	return lastEventType !== undefined && BUSY_EVENT_TYPES.has(lastEventType);
}

export function selectThreadsToDeliver(
	threads: WatchedThread[],
	entry: Pick<PageWatchEntry, "seenCommentIds" | "pings">,
): TriggerResult {
	const pings = new Map<string, number>();
	const fired: WatchedThread[] = [];
	const suppressed: string[] = [];
	const commentIds: string[] = [];
	for (const thread of threads) {
		if (thread.resolved) continue;
		const unseen = thread.comments.filter(
			(comment) =>
				comment.authorKind === "human" && !entry.seenCommentIds.has(comment.id),
		);
		if (unseen.length === 0) continue;
		if (
			commentIds.length &&
			commentIds.length + unseen.length > MAX_COMMENTS_PER_DELIVERY
		)
			break;
		const selected = unseen.slice(
			0,
			MAX_COMMENTS_PER_DELIVERY - commentIds.length,
		);
		commentIds.push(...selected.map((comment) => comment.id));
		const count = entry.pings.get(thread.id) ?? 0;
		if (count >= MAX_PINGS_PER_THREAD) {
			suppressed.push(thread.id);
		} else {
			pings.set(thread.id, count + 1);
			fired.push({
				...thread,
				comments: thread.comments.filter(
					(comment) =>
						comment.authorKind === "agent" ||
						entry.seenCommentIds.has(comment.id) ||
						selected.includes(comment),
				),
			});
		}
		if (commentIds.length >= MAX_COMMENTS_PER_DELIVERY) break;
	}
	return { fired, suppressed, commentIds, pings };
}
