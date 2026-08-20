import { OpenClosedFilter } from "renderer/routes/_authenticated/_dashboard/components/OpenClosedFilter";
import { ProjectFilter } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import { AuthorFilter } from "./components/AuthorFilter";
import { ReviewFilter } from "./components/ReviewFilter";

interface PullRequestsTopBarProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	projectFilters: string[];
	onProjectFiltersChange: (projectIds: string[]) => void;
	authorFilter: string | null;
	onAuthorFilterChange: (author: string | null) => void;
	reviewFilter: PullRequestReviewFilter | null;
	onReviewFilterChange: (review: PullRequestReviewFilter | null) => void;
	includeClosed: boolean;
	onIncludeClosedChange: (includeClosed: boolean) => void;
}

export function PullRequestsTopBar({
	searchQuery,
	onSearchChange,
	projectFilters,
	onProjectFiltersChange,
	authorFilter,
	onAuthorFilterChange,
	reviewFilter,
	onReviewFilterChange,
	includeClosed,
	onIncludeClosedChange,
}: PullRequestsTopBarProps) {
	return (
		<div
			data-pull-requests-toolbar
			className="@container shrink-0 border-b border-border px-4 py-2"
		>
			<div className="flex flex-col items-stretch gap-2 @4xl:flex-row @4xl:items-center @4xl:justify-between">
				<div className="flex min-w-0 items-center gap-3 overflow-x-auto hide-scrollbar">
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Repository</span>
						<ProjectFilter
							value={projectFilters}
							onChange={onProjectFiltersChange}
						/>
					</div>
					<div className="h-4 w-px shrink-0 bg-border" />
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Author</span>
						<AuthorFilter
							value={authorFilter}
							onChange={onAuthorFilterChange}
						/>
					</div>
					<div className="h-4 w-px shrink-0 bg-border" />
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Reviews</span>
						<ReviewFilter
							value={reviewFilter}
							onChange={onReviewFilterChange}
						/>
					</div>
					<div className="h-4 w-px shrink-0 bg-border" />
					<OpenClosedFilter
						includeClosed={includeClosed}
						onChange={onIncludeClosedChange}
					/>
				</div>
				{/* Window-drag leaf standing in for the hidden TopBar. */}
				<div className="drag hidden min-w-0 flex-1 self-stretch @4xl:block" />
				<div className="shrink-0">
					<WorkItemsSearch
						value={searchQuery}
						onChange={onSearchChange}
						placeholder="Search pull requests…"
						label="Search pull requests"
					/>
				</div>
			</div>
		</div>
	);
}
