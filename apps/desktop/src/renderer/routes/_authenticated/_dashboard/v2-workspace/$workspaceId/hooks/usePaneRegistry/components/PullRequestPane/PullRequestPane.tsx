import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { PullRequestDetailHeader } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailHeader";
import { PullRequestSummaryContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSummaryContent";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { resolvePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/resolvePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { normalizeThreadsToComments } from "../../../../components/CommentsSection/utils/normalizeThreadsToComments";
import type { CommentPaneData, PullRequestPaneData } from "../../../../types";
import {
	type OpenReviewDiff,
	useReviewCommentNavigation,
} from "../../../useReviewCommentNavigation";
import { PullRequestComments } from "./components/PullRequestComments";

interface PullRequestPaneProps {
	data: PullRequestPaneData;
	onOpenDiff: OpenReviewDiff;
	onOpenComment: (comment: CommentPaneData) => void;
}

export function PullRequestPane({
	data,
	onOpenDiff,
	onOpenComment,
}: PullRequestPaneProps) {
	const { workspace, hostUrl } = useWorkspace();
	const projectId = workspace.projectId;
	const linkedPR = workspaceTrpc.git.getPullRequest.useQuery({
		workspaceId: workspace.id,
	});
	const hasMatchingPR = linkedPR.data?.number === data.prNumber;
	const threads = workspaceTrpc.git.getPullRequestThreads.useQuery(
		{ workspaceId: workspace.id },
		{
			enabled: hasMatchingPR,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		},
	);
	const comments = useMemo(
		() =>
			threads.data
				? normalizeThreadsToComments(threads.data, linkedPR.data?.url)
				: [],
		[threads.data, linkedPR.data?.url],
	);
	const onOpenInDiff = useReviewCommentNavigation(workspace.id, onOpenDiff);
	const detail = usePullRequestDetail({
		projectId,
		hostUrl,
		prNumber: data.prNumber,
	});
	const resolved = resolvePullRequestDetail({
		prNumber: data.prNumber,
		projectId,
		// The workspace's project is the one its host serves; there's no
		// project list to wait on the way the Pull requests screen does.
		areProjectsReady: true,
		hasProject: true,
		hostUrl,
		isLoading: detail.isLoading,
		error: detail.error,
		data: detail.data,
		refetch: () => void detail.refetch(),
	});

	return (
		<div className="@container flex h-full w-full min-h-0 min-w-0 flex-col">
			<div className="flex shrink-0 flex-col border-b border-border pt-3">
				<PullRequestDetailHeader
					projectId={projectId}
					hostId={workspace.hostId}
					hostUrl={hostUrl}
					prNumber={data.prNumber}
					data={detail.data}
					isLoading={detail.isLoading}
					showStartWorkspace={false}
				/>
			</div>
			{resolved.status === "fallback" ? (
				<WorkItemDetailState
					message={resolved.message}
					isLoading={resolved.isLoading}
					isError={resolved.isError}
					onRetry={resolved.onRetry}
				/>
			) : (
				<div className="min-h-0 flex-1">
					<PullRequestSummaryContent data={resolved.data}>
						{hasMatchingPR ? (
							<PullRequestComments
								workspaceId={workspace.id}
								comments={comments}
								isLoading={threads.isLoading}
								isError={threads.isError}
								onOpenComment={onOpenComment}
								onOpenInDiff={onOpenInDiff}
							/>
						) : null}
					</PullRequestSummaryContent>
				</div>
			)}
		</div>
	);
}
