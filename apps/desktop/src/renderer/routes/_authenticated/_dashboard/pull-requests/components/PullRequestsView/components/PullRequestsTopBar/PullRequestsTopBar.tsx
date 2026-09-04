import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { LuListFilter } from "react-icons/lu";
import { ProjectFilter } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { PullRequestDetailToggle } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailToggle";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import { AuthorFilter } from "./components/AuthorFilter";
import { ReviewFilter } from "./components/ReviewFilter";

type PullRequestsStateFilter = "open" | "all" | "merged";

interface PullRequestsTopBarProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	projectFilters: string[];
	onProjectFiltersChange: (projectIds: string[]) => void;
	projectTargets: ProjectQueryTarget[];
	authorFilter: string | null;
	onAuthorFilterChange: (author: string | null) => void;
	reviewFilter: PullRequestReviewFilter | null;
	onReviewFilterChange: (review: PullRequestReviewFilter | null) => void;
	stateFilter: PullRequestsStateFilter;
	onStateFilterChange: (state: PullRequestsStateFilter) => void;
}

export function PullRequestsTopBar({
	searchQuery,
	onSearchChange,
	projectFilters,
	onProjectFiltersChange,
	projectTargets,
	authorFilter,
	onAuthorFilterChange,
	reviewFilter,
	onReviewFilterChange,
	stateFilter,
	onStateFilterChange,
}: PullRequestsTopBarProps) {
	const { t } = useLingui();
	const stateTabs: ReadonlyArray<{
		value: PullRequestsStateFilter;
		label: string;
	}> = [
		{
			value: "all",
			label: t({
				message: "All",
			}),
		},
		{
			value: "open",
			label: t({
				message: "Open",
				context: "status",
			}),
		},
		{
			value: "merged",
			label: t({
				message: "Merged",
			}),
		},
	];
	const activeFilterCount = [
		projectFilters.length > 0,
		!!authorFilter,
		!!reviewFilter,
	].filter(Boolean).length;

	return (
		<div
			data-pull-requests-toolbar
			className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2"
		>
			<div
				role="radiogroup"
				aria-label={t({
					message: "Filter by state",
				})}
				className="flex items-center gap-1"
			>
				{stateTabs.map((tab) => (
					// biome-ignore lint/a11y/useSemanticElements: styled as a pill button, not a native radio input
					<button
						key={tab.value}
						type="button"
						role="radio"
						onClick={() => onStateFilterChange(tab.value)}
						aria-checked={stateFilter === tab.value}
						className={cn(
							"rounded-md px-2 py-1 text-xs font-medium transition-colors",
							stateFilter === tab.value
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
					</button>
				))}
				{/* Window-drag leaf standing in for the hidden TopBar. */}
				<div className="drag hidden min-w-0 flex-1 self-stretch @4xl:block" />
				<div className="ml-auto shrink-0">
					<PullRequestDetailToggle />
				</div>
			</div>
			<div className="flex items-center gap-1.5">
				<div className="min-w-0 flex-1">
					<WorkItemsSearch
						value={searchQuery}
						onChange={onSearchChange}
						placeholder={t({
							message: "Search pull requests…",
						})}
						label={t({
							message: "Search pull requests",
						})}
						className="bg-muted"
					/>
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="icon-xs"
							className="relative shrink-0"
							aria-label={
								activeFilterCount > 0
									? t({
											message: `Filters, ${activeFilterCount} active`,
										})
									: t({
											message: "Filters",
										})
							}
							title={t({
								message: "Filters",
							})}
						>
							<LuListFilter className="size-3.5" />
							{activeFilterCount > 0 && (
								<span
									aria-hidden="true"
									className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground"
								>
									{activeFilterCount}
								</span>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-80 space-y-1">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">
								<Trans>Repository</Trans>
							</span>
							<ProjectFilter
								value={projectFilters}
								onChange={onProjectFiltersChange}
								alwaysShowLabel
							/>
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">
								<Trans>Author</Trans>
							</span>
							<AuthorFilter
								value={authorFilter}
								onChange={onAuthorFilterChange}
								projectTargets={projectTargets}
							/>
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">
								<Trans>Reviews</Trans>
							</span>
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
