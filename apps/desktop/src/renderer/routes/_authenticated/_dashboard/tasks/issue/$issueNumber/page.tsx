import { Trans, useLingui } from "@lingui/react/macro";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { WorkItemDetailHeader } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailHeader";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
import {
	linkedIssueFromGitLab,
	parseGitLabIssueUrl,
} from "renderer/routes/_authenticated/utils/linkedIssueFromGitLab";
import {
	type LinkedIssue,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { Route as TasksLayoutRoute } from "../../layout";
import { tasksSearchFromFilters } from "../../stores/tasks-filter-state";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/issue/$issueNumber/",
)({
	component: IssueDetailPage,
});

function IssueDetailPage() {
	const { t } = useLingui();
	const { issueNumber: issueNumberRaw } = Route.useParams();
	const issueNumber = parsePositiveIntegerParam(issueNumberRaw);
	const search = TasksLayoutRoute.useSearch();
	const navigate = useNavigate();
	const projectId = search.project ?? null;
	const expectedIssueUrl = search.issueUrl;
	const expectedIssue =
		expectedIssueUrl === undefined
			? null
			: parseGitLabIssueUrl(expectedIssueUrl);
	const {
		hostId,
		isReady: areProjectsReady,
		project,
	} = useProjectHost(projectId);
	const hostUrl = useHostUrl(hostId ?? undefined);
	const updateDraft = useNewWorkspaceDraftStore((state) => state.updateDraft);
	const selectProject = useNewWorkspaceDraftStore(
		(state) => state.selectProject,
	);
	const resetDraft = useNewWorkspaceDraftStore((state) => state.resetDraft);
	const openNewWorkspace = useOpenNewWorkspace();

	// `project` identifies this issue's repo, not the list filter: falling back
	// to it would rewrite an "all repositories" view to a single repo on back.
	const backSearch = useMemo(
		() =>
			tasksSearchFromFilters({
				tab: search.tab ?? "all",
				assignee: search.assignee ?? null,
				search: search.search ?? "",
				typeTab: "issues",
				projectFilters: resolveProjectFilterParams(search.projects, null, []),
				linearProjectFilter: search.linearProject ?? null,
				includeClosedIssues: search.state === "all",
			}),
		[
			search.assignee,
			search.linearProject,
			search.search,
			search.projects,
			search.state,
			search.tab,
		],
	);

	const { data, isLoading, error, refetch } = useQuery({
		queryKey:
			expectedIssueUrl === undefined
				? ["issue-detail", projectId, hostUrl, issueNumber]
				: ["issue-detail", projectId, hostUrl, issueNumber, expectedIssueUrl],
		queryFn: async () => {
			if (!hostUrl || !projectId || issueNumber === null) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			if (expectedIssueUrl !== undefined) {
				const fail = () =>
					new Error(
						t({ message: "GitLab issue content could not be verified" }),
					);
				if (!expectedIssue || expectedIssue.issueNumber !== issueNumber)
					throw fail();
				const result = await client.issues.getContent.query({
					projectId,
					issueNumber,
					expectedIssueUrl: expectedIssue.expectedIssueUrl,
				});
				const actual = parseGitLabIssueUrl(result.url);
				if (
					!("provider" in result) ||
					result.provider !== "gitlab" ||
					result.expectedIssueUrl !== expectedIssue.expectedIssueUrl ||
					result.number !== issueNumber ||
					actual?.host !== expectedIssue.host ||
					actual?.owner !== expectedIssue.owner ||
					actual?.repo !== expectedIssue.repo ||
					actual?.issueNumber !== issueNumber
				)
					throw fail();
				return result;
			}
			return client.issues.getContent.query({
				projectId,
				issueNumber,
			});
		},
		enabled:
			!!hostUrl &&
			!!project &&
			!!projectId &&
			issueNumber !== null &&
			(expectedIssueUrl === undefined ||
				(!!expectedIssue && expectedIssue.issueNumber === issueNumber)),
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const handleBack = () => {
		navigate({ to: "/tasks", search: backSearch });
	};

	const isGitLab =
		expectedIssueUrl !== undefined ||
		(!!data && "provider" in data && data.provider === "gitlab");
	const handleAddToWorkspace = () => {
		if (!projectId || !hostId || !data) return;
		if (isGitLab) {
			if (!hostUrl || !("provider" in data) || data.provider !== "gitlab")
				return;
			const linked = linkedIssueFromGitLab({
				projectId,
				hostId,
				hostUrl,
				issueNumber: data.number,
				title: data.title,
				url: data.url,
				state: data.state,
			});
			if (!linked) return;
			resetDraft();
			selectProject(projectId);
			updateDraft({ hostId, linkedIssues: [linked] });
			openNewWorkspace(projectId);
			return;
		}
		const linkedIssue: LinkedIssue = {
			slug: `gh-${data.number}`,
			title: data.title,
			source: "github",
			url: data.url,
			number: data.number,
			state: data.state.toLowerCase() === "closed" ? "closed" : "open",
		};
		resetDraft();
		selectProject(projectId);
		updateDraft({ hostId, linkedIssues: [linkedIssue] });
		openNewWorkspace(projectId);
	};

	const isClosed = data?.state.toLowerCase() === "closed";
	const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;
	const stateIconClass = isClosed ? "text-violet-500" : "text-emerald-500";
	const header = (
		<WorkItemDetailHeader
			itemLabel={`#${data?.number ?? issueNumber ?? "—"}`}
			icon={<StateIcon className={`size-4 shrink-0 ${stateIconClass}`} />}
			backLabel={
				isGitLab
					? t({ message: "Back to GitLab issues" })
					: t({ message: "Back to GitHub issues" })
			}
			externalLabel={
				isGitLab
					? t({ message: "Open issue in GitLab" })
					: t({ message: "Open issue in GitHub" })
			}
			url={data?.url ?? null}
			onBack={handleBack}
			onAddToWorkspace={
				isGitLab
					? data &&
						!error &&
						(expectedIssueUrl === undefined || !!expectedIssue)
						? handleAddToWorkspace
						: null
					: data
						? handleAddToWorkspace
						: null
			}
		/>
	);

	if (
		expectedIssueUrl !== undefined &&
		(!expectedIssue || expectedIssue.issueNumber !== issueNumber)
	)
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={t({ message: "GitLab issue content could not be verified" })}
					isError
				/>
			</div>
		);

	if (issueNumber === null) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={t({
						message: "This issue link is invalid.",
					})}
					isError
				/>
			</div>
		);
	}

	if (!projectId) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={
						isGitLab
							? t({
									message:
										"Choose a project from GitLab issues before opening an issue.",
								})
							: t({
									message:
										"Choose a project from GitHub issues before opening an issue.",
								})
					}
				/>
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={
						areProjectsReady
							? t({
									message:
										"This project is no longer available on your devices.",
								})
							: t({
									message: "Loading project…",
								})
					}
					isLoading={!areProjectsReady}
					isError={areProjectsReady}
				/>
			</div>
		);
	}

	if (!hostId || !hostUrl) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={t({
						message: "The device that hosts this project is unavailable.",
					})}
					isError
				/>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={t({
						message: "Loading issue…",
					})}
					isLoading
				/>
			</div>
		);
	}

	if (error instanceof Error || !data) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={
						error instanceof Error
							? error.message
							: t({
									message: "Issue not found.",
								})
					}
					isError
					onRetry={() => void refetch()}
				/>
			</div>
		);
	}

	return (
		<div className="@container flex min-h-0 flex-1 flex-col">
			{header}
			<ScrollArea className="min-h-0 flex-1">
				<div className="max-w-4xl px-4 py-5 @md:px-6 @md:py-6">
					<div className="mb-4 flex min-w-0 items-start gap-3">
						<StateIcon className={`mt-1 size-5 shrink-0 ${stateIconClass}`} />
						<h1 className="min-w-0 break-words text-2xl font-semibold leading-tight text-wrap-pretty">
							{data.title}
						</h1>
					</div>

					<div className="mb-6 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
						<span className="capitalize">{data.state}</span>
						{data.author && (
							<>
								<span aria-hidden>·</span>
								<span className="min-w-0 break-words">
									<Trans>by {data.author}</Trans>
								</span>
							</>
						)}
					</div>

					{data.body.trim() ? (
						<MarkdownRenderer content={data.body} />
					) : (
						<p className="text-sm italic text-muted-foreground">
							<Trans>No description provided.</Trans>
						</p>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
