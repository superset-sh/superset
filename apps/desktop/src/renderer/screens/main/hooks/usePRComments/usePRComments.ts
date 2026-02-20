import type { PRCommentThread } from "@superset/local-db";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export type CommentsByFile = Map<string, PRCommentThread[]>;

interface UsePRCommentsOptions {
	workspaceId: string | undefined;
	enabled?: boolean;
}

interface UsePRCommentsResult {
	commentsByFile: CommentsByFile;
	totalCount: number;
	isLoading: boolean;
	refetch: () => void;
}

export function usePRComments({
	workspaceId,
	enabled = true,
}: UsePRCommentsOptions): UsePRCommentsResult {
	const {
		data: threads,
		isLoading,
		refetch,
	} = electronTrpc.workspaces.getPRComments.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: enabled && !!workspaceId,
			staleTime: 30_000,
			refetchInterval: 60_000,
		},
	);

	const commentsByFile = useMemo(() => {
		const map: CommentsByFile = new Map();
		if (!threads) return map;
		for (const thread of threads) {
			const existing = map.get(thread.path);
			if (existing) {
				existing.push(thread);
			} else {
				map.set(thread.path, [thread]);
			}
		}
		return map;
	}, [threads]);

	const totalCount = threads?.length ?? 0;

	return { commentsByFile, totalCount, isLoading, refetch };
}
