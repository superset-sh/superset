import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import type { CommentPaneData } from "../../../../types";
import type { SidebarTabDefinition } from "../../types";
import { ReviewTabContent } from "./components/ReviewTabContent";
import type { NormalizedComment, NormalizedPR } from "./types";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type V2PullRequest = NonNullable<RouterOutputs["git"]["getPullRequest"]>;
type V2CheckRun = V2PullRequest["checks"][number];
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
			checksStatus: computeChecksStatus(raw.checks),
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

type EffectiveCheckStatus =
	| "success"
	| "failure"
	| "pending"
	| "skipped"
	| "cancelled";

const KNOWN_CHECK_STATUSES = new Set<string>([
	"success",
	"failure",
	"pending",
	"skipped",
	"cancelled",
]);

/**
 * The DB stores the already-resolved effective status in `checksJson[].status`
 * (e.g. "success", "failure").  But the tRPC router re-parses it into a
 * CheckRun whose `status` field is typed as CheckStatusState ("completed" etc.)
 * and whose `conclusion` is always null.  So we first check whether the status
 * value is already one of the effective statuses; if not, fall back to the
 * status+conclusion logic for raw GitHub data.
 */
function coerceCheckStatus(
	status: string,
	conclusion: string | null,
): EffectiveCheckStatus {
	if (KNOWN_CHECK_STATUSES.has(status)) return status as EffectiveCheckStatus;
	// Raw GitHub data path: status is "completed"/"in_progress"/etc.
	if (status !== "completed") return "pending";
	if (!conclusion) return "pending";
	if (conclusion === "success" || conclusion === "neutral") return "success";
	if (conclusion === "skipped") return "skipped";
	if (conclusion === "cancelled") return "cancelled";
	return "failure";
}

function computeChecksStatus(
	checks: V2CheckRun[],
): "success" | "failure" | "pending" | "none" {
	let hasFailure = false;
	let hasPending = false;
	let relevantCount = 0;
	for (const c of checks) {
		const s = coerceCheckStatus(c.status, c.conclusion);
		if (s === "skipped" || s === "cancelled") continue;
		relevantCount++;
		if (s === "failure") hasFailure = true;
		else if (s === "pending") hasPending = true;
	}
	if (relevantCount === 0) return "none";
	if (hasFailure) return "failure";
	if (hasPending) return "pending";
	return "success";
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
