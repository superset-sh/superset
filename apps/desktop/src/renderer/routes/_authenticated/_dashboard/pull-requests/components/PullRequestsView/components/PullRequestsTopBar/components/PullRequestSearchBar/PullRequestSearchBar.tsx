import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { LuFilter } from "react-icons/lu";
import { useHotkey } from "renderer/hotkeys";
import { ProjectFilter } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import { AuthorFilter } from "../AuthorFilter";
import { ReviewFilter } from "../ReviewFilter";

interface PullRequestSearchBarProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	projectFilters: string[];
	onProjectFiltersChange: (projectIds: string[]) => void;
	projectTargets: ProjectQueryTarget[];
	authorFilter: string | null;
	onAuthorFilterChange: (author: string | null) => void;
	reviewFilter: PullRequestReviewFilter | null;
	onReviewFilterChange: (review: PullRequestReviewFilter | null) => void;
}

export function PullRequestSearchBar({
	searchQuery,
	onSearchChange,
	projectFilters,
	onProjectFiltersChange,
	projectTargets,
	authorFilter,
	onAuthorFilterChange,
	reviewFilter,
	onReviewFilterChange,
}: PullRequestSearchBarProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const hasActiveFilters =
		projectFilters.length > 0 || !!authorFilter || !!reviewFilter;

	useHotkey(
		"FOCUS_TASK_SEARCH",
		() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		},
		{ preventDefault: true },
	);

	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<div className="relative min-w-0 flex-1 rounded-lg border border-[#ececec] dark:border-border">
				<HiOutlineMagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[#a8a5a3] dark:text-muted-foreground" />
				<input
					ref={inputRef}
					type="text"
					aria-label="Search pull requests"
					placeholder="Search pull requests"
					autoComplete="off"
					spellCheck={false}
					value={searchQuery}
					onChange={(event) => onSearchChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							onSearchChange("");
							inputRef.current?.blur();
						}
					}}
					className="h-7 w-full bg-transparent pl-7 pr-2 text-xs text-foreground placeholder:text-[#a8a5a3] focus-visible:outline-none dark:placeholder:text-muted-foreground"
				/>
			</div>
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="More filters"
						className={cn(
							"relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#eae8e6] text-[#373533] transition-colors hover:bg-[#dfdbd8] dark:bg-accent dark:text-accent-foreground dark:hover:bg-accent/70",
						)}
					>
						<LuFilter className="size-3.5" />
						{hasActiveFilters && (
							<span
								aria-hidden
								className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-emerald-500"
							/>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-72 p-3">
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">Repository</span>
							<ProjectFilter
								value={projectFilters}
								onChange={onProjectFiltersChange}
							/>
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">Author</span>
							<AuthorFilter
								value={authorFilter}
								onChange={onAuthorFilterChange}
								projectTargets={projectTargets}
							/>
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">Reviews</span>
							<ReviewFilter
								value={reviewFilter}
								onChange={onReviewFilterChange}
							/>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
