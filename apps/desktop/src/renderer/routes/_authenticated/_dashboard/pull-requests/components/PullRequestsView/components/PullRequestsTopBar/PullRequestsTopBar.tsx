import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { LuListFilter } from "react-icons/lu";
import { ProjectFilter } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import {
	PULL_REQUESTS_VIEW_TABS,
	type PullRequestsViewTab,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/viewerRelationship";
import { AuthorFilter } from "./components/AuthorFilter";
import { ReviewFilter } from "./components/ReviewFilter";

type PullRequestsStateFilter = "open" | "all" | "merged";

interface PullRequestsTopBarProps {
	viewTab: PullRequestsViewTab;
	onViewTabChange: (tab: PullRequestsViewTab) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	projectFilters: string[];
	onProjectFiltersChange: (projectIds: string[]) => void;
	authorFilter: string | null;
	onAuthorFilterChange: (author: string | null) => void;
	reviewFilter: PullRequestReviewFilter | null;
	onReviewFilterChange: (review: PullRequestReviewFilter | null) => void;
	stateFilter: PullRequestsStateFilter;
	onStateFilterChange: (state: PullRequestsStateFilter) => void;
}

const STATE_TABS: ReadonlyArray<{
	value: PullRequestsStateFilter;
	label: string;
}> = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "merged", label: "Merged" },
];

export function PullRequestsTopBar({
	viewTab,
	onViewTabChange,
	searchQuery,
	onSearchChange,
	projectFilters,
	onProjectFiltersChange,
	authorFilter,
	onAuthorFilterChange,
	reviewFilter,
	onReviewFilterChange,
	stateFilter,
	onStateFilterChange,
}: PullRequestsTopBarProps) {
	const activeFilterCount = [
		projectFilters.length > 0,
		!!authorFilter,
		!!reviewFilter,
		stateFilter !== "open",
	].filter(Boolean).length;

	return (
		<div
			data-pull-requests-toolbar
			className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2"
		>
			<div className="flex items-center gap-1">
				{PULL_REQUESTS_VIEW_TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						onClick={() => onViewTabChange(tab.value)}
						aria-pressed={viewTab === tab.value}
						className={cn(
							"rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
							viewTab === tab.value
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>
			<div className="flex items-center gap-1.5">
				<div className="min-w-0 flex-1">
					<WorkItemsSearch
						value={searchQuery}
						onChange={onSearchChange}
						placeholder="Search pull requests…"
						label="Search pull requests"
					/>
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="icon-xs"
							className="relative shrink-0"
							aria-label="Filters"
							title="Filters"
						>
							<LuListFilter className="size-3.5" />
							{activeFilterCount > 0 && (
								<span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
									{activeFilterCount}
								</span>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-72 space-y-3">
						<div className="space-y-1.5">
							<span className="text-xs text-muted-foreground">State</span>
							<div className="flex items-center gap-1">
								{STATE_TABS.map((tab) => (
									<button
										key={tab.value}
										type="button"
										onClick={() => onStateFilterChange(tab.value)}
										aria-pressed={stateFilter === tab.value}
										className={cn(
											"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
											stateFilter === tab.value
												? "bg-accent text-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										{tab.label}
									</button>
								))}
							</div>
						</div>
						<div className="space-y-1.5">
							<span className="text-xs text-muted-foreground">Repository</span>
							<ProjectFilter
								value={projectFilters}
								onChange={onProjectFiltersChange}
							/>
						</div>
						<div className="space-y-1.5">
							<span className="text-xs text-muted-foreground">Author</span>
							<AuthorFilter
								value={authorFilter}
								onChange={onAuthorFilterChange}
							/>
						</div>
						<div className="space-y-1.5">
							<span className="text-xs text-muted-foreground">Reviews</span>
							<ReviewFilter
								value={reviewFilter}
								onChange={onReviewFilterChange}
							/>
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
