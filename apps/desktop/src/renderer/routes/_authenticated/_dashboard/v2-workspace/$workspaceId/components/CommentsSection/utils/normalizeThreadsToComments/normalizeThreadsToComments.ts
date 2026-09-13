import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import type { NormalizedComment } from "../../types";

type V2ThreadsData =
	inferRouterOutputs<AppRouter>["git"]["getPullRequestThreads"];

export function normalizeThreadsToComments(
	data: V2ThreadsData,
): NormalizedComment[] {
	const comments: NormalizedComment[] = [];

	for (const thread of data.reviewThreads) {
		const first = thread.comments[0];
		if (!first) continue;
		comments.push({
			id: first.id,
			authorLogin: first.author.login,
			avatarUrl: first.author.avatarUrl || undefined,
			body: first.body,
			createdAt: first.createdAt,
			url: undefined,
			kind: "review",
			path: thread.path || undefined,
			line: thread.line ?? undefined,
			diffSide: thread.diffSide,
			isResolved: thread.isResolved,
			isOutdated: thread.isOutdated,
			threadId: thread.id,
		});
	}

	for (const c of data.conversationComments) {
		comments.push({
			id: String(c.id),
			authorLogin: c.user.login,
			avatarUrl: c.user.avatarUrl || undefined,
			body: c.body,
			createdAt: c.createdAt,
			url: c.htmlUrl || undefined,
			kind: "conversation",
			isResolved: false,
			threadId: undefined,
		});
	}

	comments.sort((a, b) => {
		const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
		const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
		return ta - tb;
	});

	return comments;
}
