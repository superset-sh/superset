import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { PullRequestDetailHeader } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailHeader";
import { PullRequestSummaryContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSummaryContent";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import { normalizeThreadsToComments } from "../../../../components/CommentsSection/utils/normalizeThreadsToComments";
import type { CommentPaneData, PullRequestPaneData } from "../../../../types";
import {
	type OpenReviewDiff,
	useReviewCommentNavigation,
} from "../../../useReviewCommentNavigation";
import { PullRequestComments } from "./components/PullRequestComments";
import { usePullRequestPaneDetail } from "./hooks/usePullRequestPaneDetail";

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
	const { t } = useLingui();
	const { workspace, hostUrl: workspaceHostUrl } = useWorkspace();
	const detail = usePullRequestPaneDetail(data);

	// Review threads and the header's actions still go through the host that
	// pushed the PR, so they exist only when this workspace's linked PR is
	// the one on screen.
	const linkedPR = workspaceTrpc.git.getPullRequest.useQuery({
		workspaceId: workspace.id,
	});
	const linkedRef = linkedPR.data?.url
		? pullRequestRefFromUrl(linkedPR.data.url)
		: null;
	const isLinkedPR = linkedRef !== null && isSamePullRequest(linkedRef, data);
	const threads = workspaceTrpc.git.getPullRequestThreads.useQuery(
		{ workspaceId: workspace.id },
		{
			enabled: isLinkedPR,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		},
	);
	const comments = useMemo(
		() =>
			isLinkedPR && threads.data
				? normalizeThreadsToComments(threads.data, linkedPR.data?.url)
				: [],
		[isLinkedPR, threads.data, linkedPR.data?.url],
	);
	const onOpenInDiff = useReviewCommentNavigation(workspace.id, onOpenDiff);

	return (
		<div className="@container flex h-full w-full min-h-0 min-w-0 flex-col">
			<div className="flex shrink-0 flex-col border-b border-border pt-3">
				<PullRequestDetailHeader
					projectId={isLinkedPR ? workspace.projectId : null}
					hostId={isLinkedPR ? workspace.hostId : null}
					hostUrl={isLinkedPR ? workspaceHostUrl : null}
					prNumber={data.number}
					data={detail.data}
					isLoading={detail.isLoading}
					showStartWorkspace={false}
				/>
			</div>
			{detail.data ? (
				<div className="min-h-0 flex-1">
					<PullRequestSummaryContent data={detail.data}>
						{isLinkedPR ? (
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
			) : (
				<WorkItemDetailState
					message={
						detail.error
							? errorMessage(detail.error)
							: t({ message: "Loading pull request…" })
					}
					isLoading={detail.isLoading}
					isError={!!detail.error}
					onRetry={detail.error ? () => void detail.refetch() : undefined}
				/>
			)}
		</div>
	);
}
