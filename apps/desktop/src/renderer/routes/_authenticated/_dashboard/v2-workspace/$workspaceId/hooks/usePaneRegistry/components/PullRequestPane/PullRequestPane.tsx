import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { PullRequestActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActions";
import type { PullRequestActivityThreads } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActivity";
import { PullRequestDetailContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailContent";
import {
	type PullRequestDetailTab,
	PullRequestDetailTabs,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailTabs";
import { usePullRequestThreads } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestThreads";
import {
	canActOnPullRequest,
	type PullRequestTarget,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { normalizeThreadsToComments } from "../../../../components/CommentsSection/utils/normalizeThreadsToComments";
import type { PagePaneData, PullRequestPaneData } from "../../../../types";
import {
	type OpenReviewDiff,
	useReviewCommentNavigation,
} from "../../../useReviewCommentNavigation";
import { PullRequestEvidence } from "./components/PullRequestEvidence";
import { usePullRequestEvidence } from "./hooks/usePullRequestEvidence";
import { usePullRequestPaneDetail } from "./hooks/usePullRequestPaneDetail";
import { buildReviewThreadEntries } from "./utils/buildReviewThreadEntries";

interface PullRequestPaneProps {
	data: PullRequestPaneData;
	onOpenDiff: OpenReviewDiff;
	onOpenPage: (page: PagePaneData) => void;
}

export function PullRequestPane({
	data,
	onOpenDiff,
	onOpenPage,
}: PullRequestPaneProps) {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState<PullRequestDetailTab>("summary");
	const { workspace, hostUrl } = useWorkspace();
	const organizationId = useActiveOrganizationId();
	const detail = usePullRequestPaneDetail(data);
	const target = useMemo<PullRequestTarget>(
		() => ({
			organizationId,
			repoFullName: data.repoFullName,
			prNumber: data.number,
			host: hostUrl ? { hostUrl, projectId: detail.projectId } : null,
		}),
		[organizationId, data.repoFullName, data.number, hostUrl, detail.projectId],
	);

	// Pages and "open in diff" belong to the workspace, so they exist only
	// when this workspace's linked PR is the one on screen.
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
	const threads = usePullRequestThreads(target);
	const onOpenInDiff = useReviewCommentNavigation(workspace.id, onOpenDiff);
	const prUrl =
		detail.data?.url ??
		`https://github.com/${data.repoFullName}/pull/${data.number}`;
	const activityThreads = useMemo<
		PullRequestActivityThreads | undefined
	>(() => {
		if (!canActOnPullRequest(target)) return undefined;
		const comments = threads.data
			? normalizeThreadsToComments(threads.data, prUrl)
			: [];
		return {
			entries: buildReviewThreadEntries({
				comments,
				target,
				onOpenInDiff: isLinkedPR ? onOpenInDiff : undefined,
			}),
			commentCount: comments.length,
			isLoading: threads.isLoading,
			isError: threads.isError || Boolean(threads.data?.fetchFailed),
		};
	}, [
		target,
		threads.data,
		threads.isLoading,
		threads.isError,
		prUrl,
		isLinkedPR,
		onOpenInDiff,
	]);
	const diffStat =
		detail.data?.additions !== undefined && detail.data.deletions !== undefined
			? { additions: detail.data.additions, deletions: detail.data.deletions }
			: null;
	// A host that predates the extended read answers without `mergeability`;
	// it would answer the writes with "No procedure found".
	const commentTarget =
		canActOnPullRequest(target) && detail.data?.mergeability !== undefined
			? target
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
						target={target}
						hostId={workspace.hostId}
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
				hostUrl={hostUrl}
				hostId={workspace.hostId}
				commentTarget={commentTarget}
				threads={activityThreads}
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
			/>
		</div>
	);
}
