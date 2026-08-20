import { useNavigate } from "@tanstack/react-router";
import { GoGitPullRequest } from "react-icons/go";
import { serializeProjectFilters } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import type { PullRequestsViewTab } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/viewerRelationship";
import { PullRequestGroupSection } from "../PullRequestGroupSection";

interface PullRequestsGroupedContentProps {
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
	repoSlugByProjectId: Map<string, string>;
	onViewTabChange: (tab: PullRequestsViewTab) => void;
}

/** The "All" tab: a "my work" dashboard grouping PRs by the viewer's
 *  relationship to them, each group bounded to a quick-glance first page. */
export function PullRequestsGroupedContent({
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
	repoSlugByProjectId,
	onViewTabChange,
}: PullRequestsGroupedContentProps) {
	const navigate = useNavigate();

	const handleOpenPreview = (pr: { projectId: string; prNumber: number }) => {
		navigate({
			to: "/pull-requests/$prNumber",
			params: { prNumber: String(pr.prNumber) },
			search: {
				search: searchQuery || undefined,
				project: pr.projectId,
				projects: serializeProjectFilters(projectFilters),
				author: authorFilter ?? undefined,
				review: reviewFilter ?? undefined,
				state: mergedOnly ? "merged" : includeClosed ? "all" : undefined,
				tab: "all",
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

	const sharedProps = {
		projectTargets,
		searchQuery,
		authorFilter,
		reviewFilter,
		includeClosed,
		mergedOnly,
		selectedPrNumber,
		selectedPrProjectId,
		repoSlugByProjectId,
		onOpenPreview: handleOpenPreview,
	};

	return (
		<div className="@container flex h-full flex-col overflow-y-auto">
			<PullRequestGroupSection
				title="Needs my review"
				viewerRelationship="needs-review"
				onViewAll={() => onViewTabChange("reviewing")}
				{...sharedProps}
			/>
			<PullRequestGroupSection
				title="Previously reviewed"
				viewerRelationship="reviewed"
				onViewAll={() => onViewTabChange("reviewing")}
				{...sharedProps}
			/>
			<PullRequestGroupSection
				title="Authored"
				viewerRelationship="authored"
				onViewAll={() => onViewTabChange("authored")}
				{...sharedProps}
			/>
		</div>
	);
}
