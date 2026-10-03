import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo, useState } from "react";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { PullRequestCodeTab } from "renderer/routes/_authenticated/_dashboard/pull-requests/$prNumber/components/PullRequestCodeTab";
import { PullRequestDetailHeader } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailHeader";
import { PullRequestSummaryContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSummaryContent";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
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

type DetailTab = "summary" | "code";

export function PullRequestPane({
	data,
	onOpenDiff,
	onOpenComment,
}: PullRequestPaneProps) {
	const { t } = useLingui();
	const detailTabs: ReadonlyArray<{ value: DetailTab; label: string }> = [
		{ value: "summary", label: t({ message: "Summary" }) },
		{ value: "code", label: t({ message: "Code" }) },
	];
	const [activeTab, setActiveTab] = useState<DetailTab>("summary");
	const { workspace, hostUrl: workspaceHostUrl } = useWorkspace();
	const detail = usePullRequestPaneDetail(data);
	// The Code tab needs a real project + host to fetch the diff from (see
	// usePullRequestPaneDetail's isFromHost) — independent of isLinkedPR
	// below, which only gates actions tied to *this* workspace's checked-out
	// PR. Any PR whose repo this workspace's project can reach gets a diff.
	const canShowCode = detail.isFromHost && !!workspace.projectId;

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
				<div className="flex items-center gap-1 px-4 pb-2">
					{detailTabs.map(({ value, label }) => (
						<button
							key={value}
							type="button"
							onClick={() => setActiveTab(value)}
							aria-current={activeTab === value ? "true" : undefined}
							className={cn(
								"rounded-md px-2 py-1 text-xs font-medium transition-colors",
								activeTab === value
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</div>
			</div>
			{detail.data ? (
				<>
					{/* Kept mounted (hidden via CSS, not unmounted) so scroll
					 *  position survives a tab switch and away — matches the
					 *  Pull requests page's own Summary/Code split. */}
					<div
						className={cn(
							"min-h-0 flex-1",
							activeTab !== "summary" && "hidden",
						)}
					>
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
					{activeTab === "code" &&
						(canShowCode && workspace.projectId ? (
							<PullRequestCodeTab
								projectId={workspace.projectId}
								prNumber={data.number}
								prUrl={detail.data.url}
								hostUrl={workspaceHostUrl}
								hostId={workspace.hostId}
							/>
						) : (
							<WorkItemDetailState
								message={t({
									message:
										"Code isn't available — this workspace's project doesn't have this pull request's repository.",
								})}
								isError
							/>
						))}
				</>
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
