import { Trans, useLingui } from "@lingui/react/macro";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { assertGitLabHostSupport } from "renderer/lib/host-service-gitlab";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { WorkItemDetailHeader } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailHeader";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
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
	const provider = search.type === "gitlab-issues" ? "gitlab" : "github";
	const navigate = useNavigate();
	const projectId = search.project ?? null;
	const {
		hostId: preferredHostId,
		isReady: areProjectsReady,
		project,
	} = useProjectHost(projectId);
	const { hostResults } = useHostProjects();
	const requestedHostId = search.host ?? null;
	const hostId = requestedHostId ?? preferredHostId;
	const hostProject = hostResults
		.find((result) => result.target.machineId === hostId)
		?.rows?.find((row) => row.id === projectId);
	const hostMatches =
		!requestedHostId || project?.hostIds.includes(requestedHostId) === true;
	const hostIdentityReady = !requestedHostId || !!hostProject;
	const identityMatches =
		!project ||
		(hostProject
			? (hostProject.provider ?? "github") === provider
			: requestedHostId
				? true
				: (project.provider ?? "github") === provider);
	const issueInstance =
		search.instance ??
		hostProject?.instance ??
		(requestedHostId ? null : (project?.instance ?? null));
	const issueRepoPath =
		search.repoPath ??
		[
			hostProject?.repoOwner ?? (requestedHostId ? null : project?.repoOwner),
			hostProject?.repoName ?? (requestedHostId ? null : project?.repoName),
		]
			.filter(Boolean)
			.join("/");
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
				typeTab: provider === "gitlab" ? "gitlab-issues" : "issues",
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
			provider,
		],
	);

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [
			"issue-detail",
			provider,
			projectId,
			hostId,
			hostUrl,
			issueInstance,
			issueRepoPath,
			issueNumber,
		],
		queryFn: async () => {
			if (
				!hostUrl ||
				!project ||
				!identityMatches ||
				!hostMatches ||
				!hostIdentityReady ||
				!projectId ||
				issueNumber === null
			)
				return null;
			if (provider === "gitlab") await assertGitLabHostSupport(hostUrl);
			const client = getHostServiceClientByUrl(hostUrl);
			return provider === "gitlab"
				? client.issues.getContent.query({
						provider: "gitlab",
						projectId,
						issueNumber,
						instance: issueInstance ?? "",
						repoPath: issueRepoPath,
					})
				: client.issues.getContent.query({ projectId, issueNumber });
		},
		enabled:
			!!hostUrl &&
			!!project &&
			identityMatches &&
			hostMatches &&
			hostIdentityReady &&
			!!projectId &&
			issueNumber !== null,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const handleBack = () => {
		navigate({ to: "/tasks", search: backSearch });
	};

	const handleAddToWorkspace = () => {
		if (!project || !projectId || !hostId || !data) return;
		const linkedIssue: LinkedIssue = {
			slug: `${provider === "gitlab" ? "gl" : "gh"}-${projectId}-${data.number}`,
			title: data.title,
			source: provider,
			url: data.url,
			number: data.number,
			state: data.state.toLowerCase() === "closed" ? "closed" : "open",
			projectId,
			hostId,
			instance: issueInstance ?? undefined,
			repoPath: issueRepoPath,
			body: data.body,
		};
		resetDraft();
		selectProject(projectId);
		updateDraft({ hostId, linkedIssues: [linkedIssue] });
		openNewWorkspace(projectId, hostId);
	};

	const isClosed = data?.state.toLowerCase() === "closed";
	const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;
	const stateIconClass = isClosed ? "text-violet-500" : "text-emerald-500";
	const header = (
		<WorkItemDetailHeader
			itemNumber={data?.number ?? issueNumber}
			icon={<StateIcon className={`size-4 shrink-0 ${stateIconClass}`} />}
			backLabel={
				provider === "gitlab"
					? t({ message: "Back to GitLab issues" })
					: t({ message: "Back to GitHub issues" })
			}
			externalLabel={
				provider === "gitlab"
					? t({ message: "Open issue in GitLab" })
					: t({ message: "Open issue in GitHub" })
			}
			url={data?.url ?? null}
			onBack={handleBack}
			onAddToWorkspace={data ? handleAddToWorkspace : null}
		/>
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
					message={t({
						message: "Choose a project before opening an issue.",
					})}
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

	if (!identityMatches) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={t({
						message: "This issue does not belong to the selected provider.",
					})}
					isError
				/>
			</div>
		);
	}

	if (!hostMatches) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={t({
						message: "This request does not match the selected project.",
					})}
					isError
				/>
			</div>
		);
	}
	if (!hostIdentityReady) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={
						areProjectsReady
							? t({
									message: "The device that hosts this project is unavailable.",
								})
							: t({ message: "Loading project…" })
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
