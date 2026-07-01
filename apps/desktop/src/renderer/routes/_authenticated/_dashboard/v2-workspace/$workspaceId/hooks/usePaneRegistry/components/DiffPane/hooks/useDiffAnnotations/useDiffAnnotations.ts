import type { SelectionSide } from "@pierre/diffs";
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
	sourceLine?: number;
}

/** Local-only metadata for a draft composer pinned to the end of a selection. */
export interface DiffAgentComposer {
	itemId: string;
	startLine: number;
	endLine: number;
	startSide: SelectionSide;
	endSide: SelectionSide;
}

export type DiffAnnotationMetadata =
	| ({ kind: "thread" } & DiffCommentThread)
	| ({ kind: "composer" } & DiffAgentComposer)
	| { kind: "binary-placeholder" };

interface UseDiffAnnotationsByPathOptions {
	workspaceId: string;
}

const EMPTY_ANNOTATIONS_BY_PATH = new Map<
	string,
	DiffLineAnnotation<DiffAnnotationMetadata>[]
>();

function parseTimestamp(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const ts = new Date(value).getTime();
	return Number.isNaN(ts) ? undefined : ts;
}

export function useDiffAnnotationsByPath({
	workspaceId,
}: UseDiffAnnotationsByPathOptions): ReadonlyMap<
	string,
	DiffLineAnnotation<DiffAnnotationMetadata>[]
> {
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
		// Gate on hasPR too — tanstack-query holds last data when the threads
		// query disables, so without this stale threads leak into non-PR diffs.
		if (!showDiffComments || !hasPR) {
			return EMPTY_ANNOTATIONS_BY_PATH;
		}
		const threads = threadsQuery.data?.reviewThreads ?? [];
		if (threads.length === 0) {
			return EMPTY_ANNOTATIONS_BY_PATH;
		}

		const annotationsByPath = new Map<
			string,
			DiffLineAnnotation<DiffAnnotationMetadata>[]
		>();
		for (const thread of threads) {
			if (!thread.path) continue;
			if (thread.line == null) continue;

			const firstDbId = thread.comments[0]?.databaseId;
			// Skip the link rather than fall back to the PR root — pointing
			// "Open on GitHub" at the PR is misleading when there's no anchor.
			const url =
				prUrl && firstDbId != null
					? `${prUrl}#discussion_r${firstDbId}`
					: undefined;

			const annotations = annotationsByPath.get(thread.path) ?? [];
			annotations.push({
				side: thread.diffSide === "LEFT" ? "deletions" : "additions",
				lineNumber: thread.line,
				metadata: {
					kind: "thread",
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
			annotationsByPath.set(thread.path, annotations);
		}

		return annotationsByPath;
	}, [showDiffComments, hasPR, threadsQuery.data, prUrl]);
}
