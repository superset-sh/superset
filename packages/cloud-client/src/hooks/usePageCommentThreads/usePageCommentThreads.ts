import type { CommentThread } from "@superset/shared/page-comments";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { pageCommentKeys } from "../../lib/pageCommentKeys";
import { toThreads } from "../../lib/toThreads";
import { useCloudClient } from "../../providers/CloudClientProvider";
import type { ServerThread } from "../../types";

interface UsePageCommentThreadsOptions {
	pageId: string;
	version: number;
}

interface PageCommentThreads {
	rows: ServerThread[];
	threads: CommentThread[];
	isLoading: boolean;
	refetch: () => void;
}

export function usePageCommentThreads({
	pageId,
	version,
}: UsePageCommentThreadsOptions): PageCommentThreads {
	const client = useCloudClient();

	const list = useQuery({
		queryKey: pageCommentKeys.list(pageId),
		queryFn: () => client.pageComment.list.query({ pageId }),
		enabled: Boolean(pageId) && version > 0,
	});

	const rows = useMemo(() => list.data ?? [], [list.data]);
	const threads = useMemo(() => toThreads(rows), [rows]);
	const { refetch } = list;
	const refresh = useCallback(() => {
		void refetch();
	}, [refetch]);

	return { rows, threads, isLoading: list.isPending, refetch: refresh };
}
