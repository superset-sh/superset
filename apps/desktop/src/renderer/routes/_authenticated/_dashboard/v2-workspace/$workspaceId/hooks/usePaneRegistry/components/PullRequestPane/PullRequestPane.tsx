import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { PullRequestDetailHeader } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailHeader";
import { PullRequestSummaryContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSummaryContent";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { resolvePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/resolvePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { PullRequestPaneData } from "../../../../types";

interface PullRequestPaneProps {
	data: PullRequestPaneData;
}

/**
 * The PR view's summary side — title, merge actions, description, checks —
 * as a workspace pane, so the PR can sit beside the diff instead of
 * replacing the workspace with the Pull requests screen. The Code tab
 * stays on that screen: the workspace's own Changes pane already shows
 * this branch's diff.
 */
export function PullRequestPane({ data }: PullRequestPaneProps) {
	const { workspace, hostUrl } = useWorkspace();
	const projectId = workspace.projectId;
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
					<PullRequestSummaryContent data={resolved.data} />
				</div>
			)}
		</div>
	);
}
