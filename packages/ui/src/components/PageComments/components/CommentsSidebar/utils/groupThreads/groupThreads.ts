import type { CommentThread } from "../../../../providers/CommentProvider";
import type { FrameRect } from "../../../../utils/commentRuntime";

export interface GroupedThreads {
	anchored: CommentThread[];
	unanchored: CommentThread[];
	openCount: number;
}

export function groupThreads({
	threads,
	rects,
	rectsReady,
	showResolved,
}: {
	threads: CommentThread[];
	rects: Record<string, FrameRect | null>;
	rectsReady: boolean;
	showResolved: boolean;
}): GroupedThreads {
	const anchored: CommentThread[] = [];
	const unanchored: CommentThread[] = [];
	let openCount = 0;

	for (const thread of threads) {
		if (!thread.resolved) openCount += 1;
		if (thread.resolved && !showResolved) continue;
		if (!rectsReady || rects[thread.id]) anchored.push(thread);
		else unanchored.push(thread);
	}

	return { anchored, unanchored, openCount };
}

export function newestActivity(thread: CommentThread): number {
	let newest = 0;
	for (const comment of thread.comments) {
		if (comment.createdAt > newest) newest = comment.createdAt;
	}
	return newest;
}
