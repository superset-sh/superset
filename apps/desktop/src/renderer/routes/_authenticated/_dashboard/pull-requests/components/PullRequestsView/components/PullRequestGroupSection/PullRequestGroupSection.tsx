import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuChevronDown, LuRefreshCw } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { useWorkItemsList } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkItemsList";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import type { ViewerRelationship } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/viewerRelationship";
import { PullRequestRow } from "../PullRequestRow";

const DEFAULT_SECTION_PAGE_SIZE = 8;

interface PullRequestGroupSectionProps {
	title: string;
	viewerRelationship: ViewerRelationship;
	projectTargets: ProjectQueryTarget[];
	searchQuery: string;
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	mergedOnly: boolean;
	selectedPrNumber: number | null;
	selectedPrProjectId: string | null;
	repoSlugByProjectId: Map<string, string>;
	onOpenPreview: (pr: { projectId: string; prNumber: number }) => void;
	/** How many rows to fetch before treating the group as "has more".
	 *  Defaults to a quick-glance size for the All tab's dashboard groups. */
	pageSize?: number;
	/** Omit when there's nowhere further to send an overflow — a plain
	 *  "+N more" note is shown instead of a link. */
	onViewAll?: () => void;
}

/** One collapsible "my work" group — a bounded first page, not a fully
 *  paginated list. `sentinelRef` is intentionally never attached, so
 *  `useWorkItemsList` never advances past page 1. */
export function PullRequestGroupSection({
	title,
	viewerRelationship,
	projectTargets,
	searchQuery,
	authorFilter,
	reviewFilter,
	includeClosed,
	mergedOnly,
	selectedPrNumber,
	selectedPrProjectId,
	repoSlugByProjectId,
	onOpenPreview,
	pageSize = DEFAULT_SECTION_PAGE_SIZE,
	onViewAll,
}: PullRequestGroupSectionProps) {
	const [isOpen, setIsOpen] = useState(true);
	const debouncedQuery = useDebouncedValue(searchQuery, 300);

	const {
		rows: pullRequests,
		totalCount,
		isFetching,
		hasNextPage,
		error,
		refetch,
	} = useWorkItemsList({
		projectTargets,
		resetKey: `${debouncedQuery.trim()}\0${authorFilter ?? ""}\0${reviewFilter ?? ""}\0${includeClosed}\0${mergedOnly}\0${viewerRelationship}\0${pageSize}`,
		getQueryOptions: ({ target, page }) => ({
			queryKey: [
				"pullRequests",
				"searchPullRequests",
				"group",
				target.key,
				target.hostUrl,
				debouncedQuery.trim(),
				authorFilter,
				reviewFilter,
				includeClosed,
				mergedOnly,
				viewerRelationship,
				pageSize,
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
					limit: pageSize,
					includeClosed,
					mergedOnly,
					viewerRelationship,
					page,
				});
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
			retry: false,
		}),
		getRows: (data) => data.pullRequests,
		getRowKey: (pullRequest) =>
			`${pullRequest.projectId}:${pullRequest.prNumber}`,
	});

	if (!isFetching && !error && totalCount === 0) return null;

	return (
		<div className="border-b border-border/50">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				className="flex w-full items-center gap-1.5 px-4 py-2 text-left hover:bg-accent/30"
				aria-expanded={isOpen}
			>
				<LuChevronDown
					className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
				/>
				<span className="text-xs font-medium text-foreground">{title}</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{isFetching && totalCount === 0 ? "…" : totalCount}
				</span>
			</button>
			{isOpen && (
				<div className="flex flex-col">
					{error instanceof Error ? (
						<div className="flex items-center gap-2 px-4 pb-2 text-xs text-destructive">
							<span className="min-w-0 flex-1 truncate select-text cursor-text">
								{error.message}
							</span>
							<Button variant="outline" size="xs" onClick={() => refetch()}>
								Retry
							</Button>
						</div>
					) : (
						<>
							{pullRequests.map((pr) => {
								const rowKey = `${pr.projectId}:${pr.prNumber}`;
								const isSelected =
									selectedPrNumber === pr.prNumber &&
									(selectedPrProjectId == null ||
										selectedPrProjectId === pr.projectId);
								const repoSlug = repoSlugByProjectId.get(pr.projectId);
								return (
									<PullRequestRow
										key={rowKey}
										pr={pr}
										repoSlug={repoSlug}
										isSelected={isSelected}
										onClick={() => onOpenPreview(pr)}
									/>
								);
							})}
							{isFetching && totalCount === 0 && (
								<div className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
									<LuRefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" />
									Loading…
								</div>
							)}
							{hasNextPage &&
								(onViewAll ? (
									<button
										type="button"
										onClick={onViewAll}
										className="px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
									>
										View all {totalCount} →
									</button>
								) : (
									<div className="px-4 py-2 text-xs text-muted-foreground">
										Showing first {pullRequests.length} of {totalCount}
									</div>
								))}
						</>
					)}
				</div>
			)}
		</div>
	);
}
