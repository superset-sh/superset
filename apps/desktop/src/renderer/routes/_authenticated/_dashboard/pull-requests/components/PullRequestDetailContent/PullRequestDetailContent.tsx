import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { lazy, type ReactNode, Suspense } from "react";
import { WorkItemDetailState } from "../../../components/WorkItemDetailState";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { pullRequestReadErrorMessage } from "../../utils/combinePullRequestReadErrors";
import type { PullRequestCommentTarget } from "../PullRequestConversationComposer";
import { PullRequestDetailSkeleton } from "../PullRequestDetailSkeleton";
import type { PullRequestDetailTab } from "../PullRequestDetailTabs";
import { PullRequestSummaryContent } from "../PullRequestSummaryContent";
import { PullRequestTabTitle } from "../PullRequestTabTitle";

// The diff renderer and its worker pool are heavy and only the Changes tab
// needs them, so the Summary paints without waiting on that chunk.
const PullRequestCodeTab = lazy(() =>
	import("../PullRequestCodeTab").then((module) => ({
		default: module.PullRequestCodeTab,
	})),
);

export function PullRequestDetailContent({
	activeTab,
	projectId,
	hostUrl,
	hostId,
	prNumber,
	repoFullName,
	detail,
	children,
	commentTarget = null,
}: {
	activeTab: PullRequestDetailTab;
	projectId: string | null;
	hostUrl: string | null;
	hostId: string | null;
	prNumber: number | null;
	repoFullName: string | null;
	detail: {
		data?: PullRequestDetail | null;
		isLoading: boolean;
		isResolvingProject?: boolean;
		error: unknown;
		refetch: () => unknown;
	};
	children?: ReactNode;
	/** Where a conversation comment posts; null hides the composer. */
	commentTarget?: PullRequestCommentTarget | null;
}) {
	const { t } = useLingui();
	if (prNumber === null || (!repoFullName && !projectId && !detail.isLoading)) {
		return (
			<WorkItemDetailState
				message={t({ message: "This pull request link is invalid." })}
				isError
			/>
		);
	}
	if (detail.isResolvingProject) return <PullRequestDetailSkeleton />;
	const prUrl =
		detail.data?.url ??
		(repoFullName
			? `https://github.com/${repoFullName}/pull/${prNumber}`
			: null);
	const detailState = detail.data ? null : detail.isLoading ? (
		<PullRequestDetailSkeleton />
	) : (
		<WorkItemDetailState
			message={
				detail.error
					? pullRequestReadErrorMessage(detail.error)
					: t({ message: "Pull request not found" })
			}
			isError={!!detail.error}
			onRetry={detail.error ? () => void detail.refetch() : undefined}
		/>
	);
	return (
		<>
			{detail.data ? (
				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col",
						activeTab !== "summary" && "hidden",
					)}
				>
					<PullRequestSummaryContent
						data={detail.data}
						commentTarget={commentTarget}
					>
						{children}
					</PullRequestSummaryContent>
				</div>
			) : activeTab === "summary" || !prUrl ? (
				detailState
			) : null}
			{activeTab === "code" && prUrl && (
				<div className="@container/detail flex min-h-0 flex-1 flex-col">
					{detail.data ? <PullRequestTabTitle data={detail.data} /> : null}
					<Suspense fallback={<PullRequestDetailSkeleton variant="diff" />}>
						<PullRequestCodeTab
							key={`${repoFullName}#${prNumber}`}
							projectId={projectId}
							hostUrl={hostUrl ?? ""}
							hostId={hostId}
							prNumber={prNumber}
							prUrl={prUrl}
						/>
					</Suspense>
				</div>
			)}
		</>
	);
}
