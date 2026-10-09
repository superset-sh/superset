import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { PullRequestActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActions";
import { PullRequestDetailContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailContent";
import {
	type PullRequestDetailTab,
	PullRequestDetailTabs,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailTabs";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { normalizeThreadsToComments } from "../../../../components/CommentsSection/utils/normalizeThreadsToComments";
import type {
	CommentPaneData,
	PagePaneData,
	PullRequestPaneData,
} from "../../../../types";
import {
	type OpenReviewDiff,
	useReviewCommentNavigation,
} from "../../../useReviewCommentNavigation";
import { PullRequestComments } from "./components/PullRequestComments";
import { PullRequestEvidence } from "./components/PullRequestEvidence";
import { usePullRequestEvidence } from "./hooks/usePullRequestEvidence";
import { usePullRequestPaneDetail } from "./hooks/usePullRequestPaneDetail";

interface PullRequestPaneProps {
	data: PullRequestPaneData;
	onOpenDiff: OpenReviewDiff;
	onOpenComment: (comment: CommentPaneData) => void;
	onOpenPage: (page: PagePaneData) => void;
}

export function PullRequestPane({
	data,
	onOpenDiff,
	onOpenComment,
	onOpenPage,
}: PullRequestPaneProps) {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState<PullRequestDetailTab>("summary");
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
	const evidence = usePullRequestEvidence(
		workspace.id,
		isLinkedPR && activeTab === "summary",
	);
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
	const projectId = isLinkedPR ? workspace.projectId : null;
	const hostId = isLinkedPR ? workspace.hostId : null;
	const hostUrl = isLinkedPR ? workspaceHostUrl : null;
	const diffStat =
		detail.data?.additions !== undefined && detail.data.deletions !== undefined
			? { additions: detail.data.additions, deletions: detail.data.deletions }
			: null;
	const commentTarget =
		projectId && hostUrl && detail.data?.mergeability !== undefined
			? { projectId, hostUrl, prNumber: data.number }
			: null;

	return (
		<div className="flex h-full w-full min-h-0 min-w-0 flex-col">
			<div className="@container/topbar flex h-11 shrink-0 items-center gap-2 px-3">
				<div className="flex min-w-0 shrink items-center overflow-x-auto [scrollbar-width:none]">
					<PullRequestDetailTabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						diffStat={diffStat}
					/>
				</div>
				<div className="ml-auto flex shrink-0 items-center">
					<PullRequestActions
						projectId={projectId}
						hostId={hostId}
						hostUrl={hostUrl}
						prNumber={data.number}
						data={detail.data}
						isLoading={detail.isLoading}
						showStartWorkspace={false}
					/>
				</div>
			</div>
			<PullRequestDetailContent
				activeTab={activeTab}
				detail={detail}
				projectId={detail.projectId}
				repoFullName={data.repoFullName}
				prNumber={data.number}
				hostUrl={workspaceHostUrl}
				hostId={workspace.hostId}
				commentTarget={commentTarget}
				summaryAside={
					isLinkedPR ? (
						<PullRequestEvidence
							{...evidence}
							onOpenPage={(page) =>
								onOpenPage({
									pageId: page.id,
									slug: page.slug,
									title: page.title,
								})
							}
							onViewAll={() =>
								void navigate({
									to: "/pages",
									search: { workspace: workspace.id },
								})
							}
						/>
					) : null
				}
			>
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
			</PullRequestDetailContent>
		</div>
	);
}
