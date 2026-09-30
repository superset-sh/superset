import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { GoGitPullRequest } from "react-icons/go";
import { LuRefreshCw } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { assertGitLabHostSupport } from "renderer/lib/host-service-gitlab";
import { LoadMoreSentinel } from "renderer/routes/_authenticated/_dashboard/components/LoadMoreSentinel";
import { serializeProjectFilters } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { useWorkItemsList } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkItemsList";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import { normalizeAuthorFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeAuthorFilter";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import { PullRequestRow } from "../PullRequestRow";

interface PullRequestsContentProps {
	projectFilters: string[];
	projectTargets: ProjectQueryTarget[];
	areProjectsReady: boolean;
	hasProjects: boolean;
	searchQuery: string;
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	mergedOnly: boolean;
	selectedPrNumber: number | null;
	selectedPrProjectId: string | null;
	selectedPrHostId: string | null;
	repoSlugByProjectId: Map<string, string>;
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
	mergedOnly,
	selectedPrNumber,
	selectedPrProjectId,
	selectedPrHostId,
	repoSlugByProjectId,
}: PullRequestsContentProps) {
	const { t } = useLingui();
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const navigate = useNavigate();
	const expandDetail = usePullRequestsSplitViewStore((s) => s.expandDetail);

	const {
		rows: pullRequests,
		totalCount,
		hasKnownTotal,
		repoMismatch,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		partialErrors,
		refetch,
		scrollRef,
		sentinelRef,
	} = useWorkItemsList({
		projectTargets,
		resetKey: `${debouncedQuery.trim()}\0${authorFilter ?? ""}\0${reviewFilter ?? ""}\0${includeClosed}\0${mergedOnly}`,
		getQueryOptions: ({ target, page, cursor }) => ({
			queryKey: [
				"pullRequests",
				"searchPullRequests",
				target.provider,
				target.key,
				target.hostUrl,
				debouncedQuery.trim(),
				authorFilter,
				reviewFilter,
				includeClosed,
				mergedOnly,
				page,
				cursor,
			],
			queryFn: async () => {
				if (
					target.provider === "github" &&
					authorFilter
						?.split(",")
						.some((author) => !normalizeAuthorFilter(author))
				) {
					return { pullRequests: [], totalCount: 0, hasNextPage: false };
				}
				const firstProject = target.projects[0];
				if (!target.hostUrl || !firstProject) return null;
				if (target.provider === "gitlab")
					await assertGitLabHostSupport(target.hostUrl);
				const client = getHostServiceClientByUrl(target.hostUrl);
				const input = {
					projectId: firstProject.projectId,
					projectIds: target.projects.map((project) => project.projectId),
					query: debouncedQuery.trim() || undefined,
					author: authorFilter ?? undefined,
					limit: PAGE_SIZE,
					includeClosed,
					mergedOnly,
					page,
				};
				const result =
					target.provider === "gitlab"
						? await client.workspaceCreation.searchGitLabMergeRequests.query({
								...input,
								cursor,
							})
						: await client.workspaceCreation.searchPullRequests.query({
								...input,
								review: reviewFilter ?? undefined,
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
						hostId: target.hostId,
						provider: target.provider,
						checks: pullRequest.checks ?? [],
					})),
				};
			},
			enabled:
				!!target.hostUrl &&
				(target.provider === "github" || page === 1 || !!cursor),
			staleTime: 30_000,
			gcTime: 10 * 60_000,
		}),
		getRows: (data) => data.pullRequests,
		getRowKey: (pullRequest) => `${pullRequest.hostId}\0${pullRequest.url}`,
	});

	const handleOpenPreview = (pr: (typeof pullRequests)[number]) => {
		expandDetail();
		navigate({
			to: "/pull-requests/$prNumber",
			params: { prNumber: String(pr.prNumber) },
			search: {
				search: searchQuery || undefined,
				project: pr.projectId,
				host: pr.hostId ?? undefined,
				provider: pr.provider === "gitlab" ? "gitlab" : undefined,
				instance: "instance" in pr ? pr.instance : undefined,
				repoPath: "repoPath" in pr ? pr.repoPath : undefined,
				projects: serializeProjectFilters(projectFilters),
				author: authorFilter ?? undefined,
				review: reviewFilter ?? undefined,
				state: mergedOnly ? "merged" : includeClosed ? "all" : undefined,
			},
		});
	};

	if (projectTargets.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
					<GoGitPullRequest className="h-8 w-8" />
					<span className="max-w-prose text-sm text-wrap-pretty">
						{areProjectsReady ? (
							hasProjects ? (
								<Trans>Select a project to see pull requests.</Trans>
							) : (
								<Trans>Add a project to see pull requests.</Trans>
							)
						) : (
							<Trans>Loading projects…</Trans>
						)}
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
						<Trans>The device that hosts this project is unavailable.</Trans>
					</span>
				</div>
			</div>
		);
	}

	const isInitialLoad = isFetching && pullRequests.length === 0;
	const displayError = error?.message ?? partialErrors.join("; ");
	// Without a project to disambiguate, only the first row sharing this PR
	// number gets marked selected — distinct repos can reuse the same number.
	const firstMatchingPrIndex =
		selectedPrProjectId == null
			? pullRequests.findIndex((pr) => pr.prNumber === selectedPrNumber)
			: -1;
	return (
		<div
			className="@container flex h-full flex-col overflow-hidden"
			aria-busy={isFetching}
		>
			<div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
				<GoGitPullRequest className="size-3.5 text-muted-foreground" />
				<span className="text-xs text-muted-foreground" aria-live="polite">
					<span className="tabular-nums">
						{isInitialLoad ? (
							<Trans>Loading…</Trans>
						) : !hasKnownTotal ? (
							pullRequests.length
						) : totalCount === 0 ? (
							"0"
						) : (
							<Trans>
								{pullRequests.length} of {totalCount}
							</Trans>
						)}
					</span>{" "}
					<Plural
						value={hasKnownTotal ? totalCount : pullRequests.length}
						one="pull request"
						other="pull requests"
					/>
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					className="ml-auto"
					title={t({
						message: "Refresh",
					})}
					aria-label={t({
						message: "Refresh pull requests",
					})}
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
			</div>

			<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
				{displayError && pullRequests.length === 0 ? (
					<div className="flex flex-col items-start gap-3 px-4 py-4 text-sm text-destructive select-text cursor-text">
						<span>{displayError}</span>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							<Trans>Try again</Trans>
						</Button>
					</div>
				) : repoMismatch ? (
					<div className="px-4 py-3 text-sm text-muted-foreground select-text cursor-text">
						<Trans>PR URL must match {repoMismatch}.</Trans>
					</div>
				) : isInitialLoad ? (
					<div className="flex h-full items-center justify-center gap-2 p-8 text-muted-foreground">
						<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
						<span className="text-sm">
							<Trans>Loading pull requests…</Trans>
						</span>
					</div>
				) : totalCount === 0 && !isFetching ? (
					<div className="flex h-full items-center justify-center p-8">
						<span className="text-sm text-muted-foreground">
							{mergedOnly ? (
								<Trans>No merged pull requests.</Trans>
							) : includeClosed ? (
								<Trans>No pull requests found.</Trans>
							) : (
								<Trans>No open pull requests.</Trans>
							)}
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-1.5 p-2">
						{displayError && (
							<div className="flex items-center gap-2 rounded-lg bg-destructive/5 px-4 py-2 text-xs text-destructive">
								<span className="min-w-0 flex-1 truncate select-text cursor-text">
									<Trans>
										Some repositories could not be loaded: {displayError}
									</Trans>
								</span>
								<Button variant="outline" size="xs" onClick={() => refetch()}>
									<Trans>Retry</Trans>
								</Button>
							</div>
						)}
						{pullRequests.map((pr, index) => {
							const rowKey = `${pr.hostId}:${pr.url}`;
							const isSelected =
								selectedPrNumber === pr.prNumber &&
								(selectedPrHostId == null || selectedPrHostId === pr.hostId) &&
								(selectedPrProjectId != null
									? selectedPrProjectId === pr.projectId
									: firstMatchingPrIndex === index);
							const repoSlug =
								pr.provider === "gitlab" && "repoPath" in pr
									? pr.repoPath
									: repoSlugByProjectId.get(pr.projectId);
							return (
								<PullRequestRow
									key={rowKey}
									pr={pr}
									repoSlug={repoSlug}
									isSelected={isSelected}
									onClick={() => handleOpenPreview(pr)}
								/>
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
