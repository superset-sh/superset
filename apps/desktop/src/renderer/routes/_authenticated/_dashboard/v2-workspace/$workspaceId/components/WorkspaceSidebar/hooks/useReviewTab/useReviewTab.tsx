import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import { LuMessageSquare } from "react-icons/lu";
import type { CommentPaneData } from "../../../../types";
import {
	coerceCheckStatus,
	computeChecksRollup,
} from "../../components/PRActionHeader/utils/computeChecksStatus";
import type { SidebarTabDefinition } from "../../types";
import { ReviewTabContent } from "./components/ReviewTabContent";
import type { NormalizedComment, NormalizedPR } from "./types";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type V2ThreadsData = RouterOutputs["git"]["getPullRequestThreads"];

interface UseReviewTabParams {
	workspaceId: string;
	onOpenComment?: (comment: CommentPaneData) => void;
}

export function useReviewTab({
	workspaceId,
	onOpenComment,
}: UseReviewTabParams): SidebarTabDefinition {
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);

	const hasPR = prQuery.isSuccess && prQuery.data != null;
	const threadsQuery = workspaceTrpc.git.getPullRequestThreads.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId && hasPR,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		},
	);

	const pr = useMemo<NormalizedPR | null>(() => {
		const raw = prQuery.data;
		if (!raw) return null;
		return {
			number: raw.number,
			url: raw.url,
			title: raw.title,
			state: raw.isDraft ? "draft" : raw.state,
			reviewDecision: normalizeReviewDecision(raw.reviewDecision),
			checksStatus: computeChecksRollup(raw.checks).overall,
			checks: raw.checks.map((c) => ({
				name: c.name,
				// The DB stores the already-resolved effective status (success/failure/
				// pending/skipped/cancelled) in the `status` field, even though the
				// tRPC type calls it CheckStatusState.  Fall back to coercing it.
				status: coerceCheckStatus(c.status, c.conclusion),
				url: c.detailsUrl ?? undefined,
				durationText: computeDurationText(c.startedAt, c.completedAt),
			})),
		};
	}, [prQuery.data]);

	const comments = useMemo<NormalizedComment[]>(() => {
		const data = threadsQuery.data;
		if (!data) return [];
		return normalizeThreadsToComments(data);
	}, [threadsQuery.data]);

	const openCommentCount = comments.filter((c) => !c.isResolved).length;

	const content = (
		<ReviewTabContent
			pr={pr}
			comments={comments}
			isLoading={prQuery.isLoading}
			isError={prQuery.isError}
			isCommentsLoading={threadsQuery.isLoading}
			onOpenComment={onOpenComment}
		/>
	);

	return {
		id: "review",
		label: "Review",
		icon: LuMessageSquare,
		badge: openCommentCount,
		content,
	};
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeReviewDecision(
	decision: string | null,
): "approved" | "changes_requested" | "pending" {
	if (decision === "approved") return "approved";
	if (decision === "changes_requested") return "changes_requested";
	return "pending";
}

function computeDurationText(
	startedAt: string | null,
	completedAt: string | null,
): string | undefined {
	if (!startedAt || !completedAt) return undefined;
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	if (Number.isNaN(ms) || ms < 0) return undefined;
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	return `${minutes}m`;
}

function normalizeThreadsToComments(data: V2ThreadsData): NormalizedComment[] {
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
			isResolved: thread.isResolved,
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
