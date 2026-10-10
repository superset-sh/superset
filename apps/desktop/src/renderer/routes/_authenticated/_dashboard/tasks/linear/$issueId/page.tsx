import { Trans, useLingui } from "@lingui/react/macro";
import { ScrollArea } from "@superset/ui/scroll-area";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { WorkItemDetailHeader } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailHeader";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { StatusIcon } from "../../components/TasksView/components/shared/StatusIcon";
import { useLinearIssueActions } from "../../hooks/useLinearIssueActions";
import { Route as TasksLayoutRoute } from "../../layout";
import { tasksSearchFromFilters } from "../../stores/tasks-filter-state";
import { statusIconType } from "../../utils/linearIssueTypes";
import { LinearIssueSidebar } from "./components/LinearIssueSidebar";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/linear/$issueId/",
)({
	component: LinearIssueDetailPage,
});

const ISSUE_STALE_MS = 30_000;

function LinearIssueDetailPage() {
	const { t } = useLingui();
	const { issueId } = Route.useParams();
	const search = TasksLayoutRoute.useSearch();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const { addToWorkspace } = useLinearIssueActions();

	const backSearch = useMemo(
		() =>
			tasksSearchFromFilters({
				tab: search.tab ?? "all",
				assignee: search.assignee ?? null,
				search: search.search ?? "",
				typeTab: "linear",
				projectFilters: resolveProjectFilterParams(search.projects, null, []),
				includeClosedIssues: search.state === "all",
			}),
		[search.assignee, search.projects, search.search, search.state, search.tab],
	);

	const { data, isLoading, error, refetch } =
		cloudTrpc.integration.linear.issue.useQuery(
			{ organizationId: organizationId ?? "", issueId },
			{ enabled: !!organizationId, staleTime: ISSUE_STALE_MS, retry: false },
		);

	const header = (
		<WorkItemDetailHeader
			itemLabel={data?.identifier ?? issueId}
			icon={
				data ? (
					<StatusIcon
						type={statusIconType(data.state.type)}
						color={data.state.color}
					/>
				) : null
			}
			backLabel={t({ message: "Back to Linear" })}
			externalLabel={t({ message: "Open issue in Linear" })}
			url={data?.url ?? null}
			onBack={() => navigate({ to: "/tasks", search: backSearch })}
			onAddToWorkspace={data ? () => addToWorkspace(data) : null}
		/>
	);

	if (isLoading || error || !data) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={
						isLoading
							? t({ message: "Loading issue…" })
							: (error?.message ?? t({ message: "Issue not found." }))
					}
					isLoading={isLoading}
					isError={!isLoading}
					onRetry={isLoading ? undefined : () => void refetch()}
				/>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1">
			<div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
				{header}
				<ScrollArea className="min-h-0 flex-1">
					<div className="max-w-4xl px-4 py-5 @md:px-6 @md:py-6">
						<h1 className="mb-4 break-words text-2xl font-semibold leading-tight text-wrap-pretty">
							{data.title}
						</h1>
						{data.description?.trim() ? (
							<MarkdownEditor content={data.description} editable={false} />
						) : (
							<p className="text-sm italic text-muted-foreground">
								<Trans>No description provided.</Trans>
							</p>
						)}
					</div>
				</ScrollArea>
			</div>
			<LinearIssueSidebar issue={data} />
		</div>
	);
}
