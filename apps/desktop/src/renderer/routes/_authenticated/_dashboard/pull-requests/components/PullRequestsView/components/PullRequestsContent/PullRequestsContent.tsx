import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { GoGitPullRequest } from "react-icons/go";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuMinus, LuPlus, LuRefreshCw } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { LoadMoreSentinel } from "renderer/routes/_authenticated/_dashboard/components/LoadMoreSentinel";
import { serializeProjectFilters } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { useWorkItemsList } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkItemsList";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import {
	normalizePRState,
	PRIcon,
} from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { PullRequestChecksSummary } from "../../../PullRequestChecksSummary";

interface PullRequestsContentProps {
	projectFilters: string[];
	projectTargets: ProjectQueryTarget[];
	areProjectsReady: boolean;
	hasProjects: boolean;
	searchQuery: string;
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	onCollapse?: () => void;
}

const PAGE_SIZE = 30;

export function PullRequestsContent({
	projectFilters,
	projectTargets,
	areProjectsReady,
	hasProjects,
	searchQuery,
	authorFilter,
	reviewFilter,
	includeClosed,
	onCollapse,
}: PullRequestsContentProps) {
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const navigate = useNavigate();
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const selectProject = useNewWorkspaceDraftStore((s) => s.selectProject);
	const resetDraft = useNewWorkspaceDraftStore((s) => s.resetDraft);
	const openModal = useOpenNewWorkspaceModal();

	const {
		rows: pullRequests,
		totalCount,
		repoMismatch,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		refetch,
		scrollRef,
		sentinelRef,
	} = useWorkItemsList({
		projectTargets,
		resetKey: `${debouncedQuery.trim()}\0${authorFilter ?? ""}\0${reviewFilter ?? ""}\0${includeClosed}`,
		getQueryOptions: ({ target, page }) => ({
			queryKey: [
				"pullRequests",
				"searchPullRequests",
				target.key,
				target.hostUrl,
				debouncedQuery.trim(),
				authorFilter,
				reviewFilter,
				includeClosed,
				page,
			],
			queryFn: async () => {
				const firstProject = target.projects[0];
				if (!target.hostUrl || !firstProject) return null;
				const client = getHostServiceClientByUrl(target.hostUrl);
				const result = await client.workspaceCreation.searchPullRequests.query({
					projectId: firstProject.projectId,
					projectIds: target.projects.map((project) => project.projectId),
					query: debouncedQuery.trim() || undefined,
					author: authorFilter ?? undefined,
					review: reviewFilter ?? undefined,
					limit: PAGE_SIZE,
					includeClosed,
					page,
				});
				// The router types come from this build, the rows come from
				// whichever host-service the host actually runs — hosts update
				// independently and the list is not version-gated. Rows only
				// gained `checks` in host-service 1.20.0, so an older host
				// answers without it. Absent checks read as "none reported".
				return {
					...result,
					pullRequests: result.pullRequests.map((pullRequest) => ({
						...pullRequest,
						checks: pullRequest.checks ?? [],
					})),
				};
			},
			enabled: !!target.hostUrl,
			staleTime: 30_000,
			gcTime: 10 * 60_000,
		}),
		getRows: (data) => data.pullRequests,
		getRowKey: (pullRequest) =>
			`${pullRequest.projectId}:${pullRequest.prNumber}`,
	});

	const handleAddToWorkspace = (pr: (typeof pullRequests)[number]) => {
		const linkedPR: LinkedPR = {
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: normalizePRState(pr.state, pr.isDraft),
		};
		resetDraft();
		selectProject(pr.projectId);
		updateDraft({ hostId: pr.hostId, linkedPR });
		openModal(pr.projectId);
	};

	const handleOpenUrl = (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleOpenPreview = (pr: (typeof pullRequests)[number]) => {
		navigate({
			to: "/pull-requests/$prNumber",
			params: { prNumber: String(pr.prNumber) },
			search: {
				search: searchQuery || undefined,
				project: pr.projectId,
				projects: serializeProjectFilters(projectFilters),
				author: authorFilter ?? undefined,
				review: reviewFilter ?? undefined,
				state: includeClosed ? "all" : undefined,
			},
		});
	};

	if (projectTargets.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
					<GoGitPullRequest className="h-8 w-8" />
					<span className="max-w-prose text-sm text-wrap-pretty">
						{areProjectsReady
							? hasProjects
								? "Select a project to see pull requests."
								: "Add a project to see pull requests."
							: "Loading projects…"}
					</span>
				</div>
			</div>
		);
	}

	if (projectTargets.every((target) => !target.hostUrl)) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex max-w-prose flex-col items-center gap-2 text-center text-muted-foreground">
					<GoGitPullRequest className="size-8" />
					<span className="text-sm text-wrap-pretty">
						The device that hosts this project is unavailable.
					</span>
				</div>
			</div>
		);
	}

	const isInitialLoad = isFetching && pullRequests.length === 0;
	const countLabel = isInitialLoad
		? "Loading…"
		: totalCount === 0
			? "0"
			: `${pullRequests.length} of ${totalCount}`;

	return (
		<div
			className="@container flex h-full flex-col overflow-hidden"
			aria-busy={isFetching}
		>
			<div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
				<GoGitPullRequest className="size-3.5 text-muted-foreground" />
				<span className="text-xs text-muted-foreground" aria-live="polite">
					<span className="tabular-nums">{countLabel}</span>{" "}
					{totalCount === 1 ? "pull request" : "pull requests"}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					className="ml-auto"
					title="Refresh"
					aria-label="Refresh pull requests"
					disabled={isFetching}
					onClick={() => refetch()}
				>
					<LuRefreshCw
						className={
							isFetching
								? "size-3.5 animate-spin motion-reduce:animate-none"
								: "size-3.5"
						}
					/>
				</Button>
				{onCollapse && (
					<Button
						variant="ghost"
						size="icon-xs"
						title="Minimize"
						aria-label="Minimize pull requests"
						onClick={onCollapse}
					>
						<LuMinus className="size-3.5" />
					</Button>
				)}
			</div>

			<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
				{error instanceof Error && pullRequests.length === 0 ? (
					<div className="flex flex-col items-start gap-3 px-4 py-4 text-sm text-destructive select-text cursor-text">
						<span>{error.message}</span>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							Try again
						</Button>
					</div>
				) : repoMismatch ? (
					<div className="px-4 py-3 text-sm text-muted-foreground select-text cursor-text">
						PR URL must match {repoMismatch}.
					</div>
				) : isInitialLoad ? (
					<div className="flex h-full items-center justify-center gap-2 p-8 text-muted-foreground">
						<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
						<span className="text-sm">Loading pull requests…</span>
					</div>
				) : totalCount === 0 && !isFetching ? (
					<div className="flex h-full items-center justify-center p-8">
						<span className="text-sm text-muted-foreground">
							{includeClosed
								? "No pull requests found."
								: "No open pull requests."}
						</span>
					</div>
				) : (
					<div className="flex flex-col">
						{error instanceof Error && (
							<div className="flex items-center gap-2 border-b border-border/50 bg-destructive/5 px-4 py-2 text-xs text-destructive">
								<span className="min-w-0 flex-1 truncate select-text cursor-text">
									Some repositories could not be loaded: {error.message}
								</span>
								<Button variant="outline" size="xs" onClick={() => refetch()}>
									Retry
								</Button>
							</div>
						)}
						{pullRequests.map((pr) => {
							const state = normalizePRState(pr.state, pr.isDraft);
							const rowKey = `${pr.projectId}:${pr.prNumber}`;
							return (
								// biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons, so the outer element is a div with role/tabIndex
								<div
									key={rowKey}
									className="group flex h-10 cursor-pointer items-center gap-3 border-b border-border/50 px-4 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									onClick={() => handleOpenPreview(pr)}
									onKeyDown={(e) => {
										if (e.target !== e.currentTarget) return;
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleOpenPreview(pr);
										}
									}}
									role="button"
									tabIndex={0}
								>
									<PRIcon state={state} className="size-4 shrink-0" />
									{projectTargets.length > 1 && (
										<span className="hidden max-w-28 shrink-0 truncate text-xs text-muted-foreground @lg:inline">
											{pr.projectName}
										</span>
									)}
									<span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
										#{pr.prNumber}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{pr.title}
									</span>
									<PullRequestChecksSummary checks={pr.checks} />
									{pr.authorLogin && (
										<span className="hidden shrink-0 text-xs text-muted-foreground @md:inline">
											{pr.authorLogin}
										</span>
									)}
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="icon-xs"
											title="Open in browser"
											aria-label={`Open pull request #${pr.prNumber} in browser`}
											onClick={(e) => {
												e.stopPropagation();
												handleOpenUrl(pr.url);
											}}
										>
											<HiOutlineArrowTopRightOnSquare className="size-3.5" />
										</Button>
										<Button
											variant="outline"
											size="sm"
											title="Add to workspace"
											aria-label={`Add pull request #${pr.prNumber} to workspace`}
											className="h-7 gap-1.5 px-2 text-xs"
											onClick={(e) => {
												e.stopPropagation();
												handleAddToWorkspace(pr);
											}}
										>
											<LuPlus className="size-3.5" />
											<span className="hidden @lg:inline">
												Add to workspace
											</span>
										</Button>
									</div>
								</div>
							);
						})}
						<LoadMoreSentinel
							sentinelRef={sentinelRef}
							hasNextPage={hasNextPage}
							isFetchingNextPage={isFetchingNextPage}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
