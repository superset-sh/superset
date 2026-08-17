import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
	type PullRequestConversationComment,
	type PullRequestReviewThread,
	type PullRequestThreads,
} from "@/lib/host-service/client";

const THREADS_STALE_MS = 30_000;
const THREADS_REFETCH_MS = 60_000;

const NO_THREADS: PullRequestReviewThread[] = [];
const NO_CONVERSATION: PullRequestConversationComment[] = [];

export interface WorkspaceReviewThreadsResult {
	/** Unresolved review threads, oldest first. */
	unresolved: PullRequestReviewThread[];
	/** Resolved review threads, oldest first — de-emphasised, never hidden. */
	resolved: PullRequestReviewThread[];
	/** PR-level (non-anchored) comments, oldest first. */
	conversation: PullRequestConversationComment[];
	isLoading: boolean;
	isError: boolean;
	/** The workspace's host is unreachable, so threads can't be fetched at all. */
	isHostOffline: boolean;
	/** Threads with a resolution mutation in flight. */
	pendingThreadIds: ReadonlySet<string>;
	setResolved: (threadId: string, resolved: boolean) => void;
	refetch: () => Promise<unknown>;
}

export function getReviewThreadsQueryKey(workspaceId: string | null) {
	return ["workspace-review-threads", workspaceId] as const;
}

function firstCommentTime(thread: PullRequestReviewThread): number {
	const createdAt = thread.comments[0]?.createdAt;
	const ms = createdAt ? new Date(createdAt).getTime() : 0;
	return Number.isNaN(ms) ? 0 : ms;
}

/**
 * The workspace PR's review threads, with optimistic resolve/unresolve.
 *
 * `enabled` is gated on the workspace's host being online — the host resolves
 * the PR from its own DB row, so this returns empty for workspaces whose PR
 * the host doesn't know about yet.
 */
export function useReviewThreads(
	workspaceId: string | null,
	options?: { enabled?: boolean },
): WorkspaceReviewThreadsResult {
	const { host } = useWorkspaceHost(workspaceId);
	const queryClient = useQueryClient();
	const hostUrl =
		host?.isOnline === true
			? buildRelayHostUrl(host.organizationId, host.machineId)
			: null;
	const queryKey = getReviewThreadsQueryKey(workspaceId);
	// Tracked here rather than off the mutation: `useMutation` only remembers
	// its latest variables, and tapping two threads in a row leaves both in
	// flight.
	const [pendingThreadIds, setPendingThreadIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);

	const query = useQuery({
		queryKey,
		enabled:
			hostUrl !== null && workspaceId !== null && options?.enabled !== false,
		staleTime: THREADS_STALE_MS,
		refetchInterval: THREADS_REFETCH_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: () => {
			if (!hostUrl || !workspaceId) throw new Error("Host is not resolved");
			return getHostServiceClientByUrl(hostUrl).git.getPullRequestThreads.query(
				{ workspaceId },
			);
		},
	});

	const resolution = useMutation({
		networkMode: "always" as const,
		mutationFn: (variables: { threadId: string; resolved: boolean }) => {
			if (!hostUrl || !workspaceId) throw new Error("Host is not resolved");
			return getHostServiceClientByUrl(
				hostUrl,
			).git.setReviewThreadResolution.mutate({
				workspaceId,
				threadId: variables.threadId,
				resolved: variables.resolved,
			});
		},
		onMutate: async (variables) => {
			setPendingThreadIds((current) =>
				new Set(current).add(variables.threadId),
			);
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<PullRequestThreads>(queryKey);
			queryClient.setQueryData<PullRequestThreads>(queryKey, (current) =>
				current
					? {
							...current,
							reviewThreads: current.reviewThreads.map((thread) =>
								thread.id === variables.threadId
									? { ...thread, isResolved: variables.resolved }
									: thread,
							),
						}
					: current,
			);
			return { previous };
		},
		onError: (cause, variables, context) => {
			// Put the thread back where it was — a half-applied resolve reads as
			// "GitHub took it" and the reviewer moves on.
			if (context?.previous !== undefined) {
				queryClient.setQueryData(queryKey, context.previous);
			}
			Alert.alert(
				variables.resolved
					? "Could not resolve thread"
					: "Could not unresolve thread",
				cause instanceof Error ? cause.message : String(cause),
			);
		},
		onSettled: (_data, _error, variables) => {
			setPendingThreadIds((current) => {
				const next = new Set(current);
				next.delete(variables.threadId);
				return next;
			});
			void queryClient.invalidateQueries({ queryKey });
		},
	});

	const { unresolved, resolved } = useMemo(() => {
		const threads = query.data?.reviewThreads ?? NO_THREADS;
		const sorted = [...threads].sort(
			(a, b) => firstCommentTime(a) - firstCommentTime(b),
		);
		return {
			unresolved: sorted.filter((thread) => !thread.isResolved),
			resolved: sorted.filter((thread) => thread.isResolved),
		};
	}, [query.data]);

	const conversation = useMemo(() => {
		const comments = query.data?.conversationComments ?? NO_CONVERSATION;
		return [...comments].sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
	}, [query.data]);

	// Pull-to-refresh reaches here even with no host to ask — `refetch` ignores
	// `enabled`, and the queryFn would throw into the caller's Promise.all.
	const refetch = useCallback(async () => {
		if (!hostUrl || !workspaceId) return;
		return query.refetch();
	}, [hostUrl, workspaceId, query.refetch]);

	const setResolved = useCallback(
		(threadId: string, resolved: boolean) => {
			resolution.mutate({ threadId, resolved });
		},
		[resolution.mutate],
	);

	return {
		unresolved,
		resolved,
		conversation,
		isLoading: query.isLoading,
		isError: query.isError,
		isHostOffline: hostUrl === null,
		pendingThreadIds,
		setResolved,
		refetch,
	};
}
