import type { DiffLineAnnotation } from "@pierre/diffs/react";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { useSettings } from "renderer/stores/settings";

export interface DiffThreadComment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

export interface DiffCommentThread {
	threadId: string;
	comments: DiffThreadComment[];
	isResolved: boolean;
	isOutdated: boolean;
	url?: string;
}

interface UseDiffAnnotationsOptions {
	workspaceId: string;
	path: string;
}

const EMPTY_ANNOTATIONS: DiffLineAnnotation<DiffCommentThread>[] = [];

function parseTimestamp(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const ts = new Date(value).getTime();
	return Number.isNaN(ts) ? undefined : ts;
}

export function useDiffAnnotations({
	workspaceId,
	path,
}: UseDiffAnnotationsOptions): DiffLineAnnotation<DiffCommentThread>[] {
	const showDiffComments = useSettings((s) => s.showDiffComments);
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId && showDiffComments,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);
	const hasPR = prQuery.isSuccess && prQuery.data != null;
	const threadsQuery = workspaceTrpc.git.getPullRequestThreads.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId && hasPR && showDiffComments,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		},
	);

	const prUrl = prQuery.data?.url ?? undefined;

	return useMemo(() => {
		// Gate on hasPR too: when the PR goes away the threads query disables
		// itself but tanstack-query keeps the last data around in cache, so
		// without this check stale threads could leak into a non-PR diff.
		if (!showDiffComments || !hasPR) {
			return EMPTY_ANNOTATIONS;
		}
		const threads = threadsQuery.data?.reviewThreads ?? [];
		if (threads.length === 0) {
			return EMPTY_ANNOTATIONS;
		}

		const annotations: DiffLineAnnotation<DiffCommentThread>[] = [];
		for (const thread of threads) {
			if (thread.path !== path) continue;
			if (thread.line == null) continue;

			const firstDbId = thread.comments[0]?.databaseId;
			// Only emit a deep link when we have an actual discussion anchor.
			// Falling back to the PR root makes "Open on GitHub" misleading.
			const url =
				prUrl && firstDbId != null
					? `${prUrl}#discussion_r${firstDbId}`
					: undefined;

			annotations.push({
				side: thread.diffSide === "LEFT" ? "deletions" : "additions",
				lineNumber: thread.line,
				metadata: {
					threadId: thread.id,
					isResolved: thread.isResolved,
					isOutdated: thread.isOutdated,
					...(url ? { url } : {}),
					comments: thread.comments.map((c) => {
						const createdAt = parseTimestamp(c.createdAt);
						return {
							id: c.id,
							authorLogin: c.author.login,
							...(c.author.avatarUrl ? { avatarUrl: c.author.avatarUrl } : {}),
							body: c.body,
							...(createdAt != null ? { createdAt } : {}),
						};
					}),
				},
			});
		}

		return annotations;
	}, [showDiffComments, hasPR, threadsQuery.data, path, prUrl]);
}
