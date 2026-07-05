import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { FoldVertical, UnfoldVertical } from "lucide-react";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { Commit } from "../../types";
import { ViewModeToggle } from "../ChangesHeader/components/ViewModeToggle";
import { CommitFilterDropdown } from "../CommitFilterDropdown";

interface ChangesToolbarProps {
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount: number;
	totalFiles: number;
	totalAdditions: number;
	totalDeletions: number;
	viewMode: ChangesViewMode;
	onViewModeChange: (next: ChangesViewMode) => void;
	/** Whether the last fold action was "collapse all". */
	collapsed: boolean;
	/** Toggle between collapse-all and expand-all across every section. */
	onToggleFold: () => void;
}

/**
 * Single action row beneath the changes header: the commit/uncommitted filter
 * and the changeset totals on the left, then the folders/tree view-mode toggle
 * and a collapse/expand-all toggle on the right. The fold action applies to
 * every section's folder groups (folders mode) or tree directories (tree mode).
 */
export function ChangesToolbar({
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
	totalFiles,
	totalAdditions,
	totalDeletions,
	viewMode,
	onViewModeChange,
	collapsed,
	onToggleFold,
}: ChangesToolbarProps) {
	const label = collapsed ? "Expand all" : "Collapse all";
	const Icon = collapsed ? UnfoldVertical : FoldVertical;
	return (
		<div className="flex items-center justify-between gap-2 border-b border-border px-2 pt-0.5 pb-1.5">
			<div className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px] text-muted-foreground">
				<CommitFilterDropdown
					filter={filter}
					onFilterChange={onFilterChange}
					commits={commits}
					uncommittedCount={uncommittedCount}
				/>
				<span className="whitespace-nowrap">
					{totalFiles} {totalFiles === 1 ? "file" : "files"}
				</span>
				{(totalAdditions > 0 || totalDeletions > 0) && (
					<span className="whitespace-nowrap">
						{totalAdditions > 0 && (
							<span className="text-green-400">+{totalAdditions}</span>
						)}
						{totalAdditions > 0 && totalDeletions > 0 && " "}
						{totalDeletions > 0 && (
							<span className="text-red-400">-{totalDeletions}</span>
						)}
					</span>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-5 text-muted-foreground hover:text-foreground"
							onClick={onToggleFold}
							aria-label={label}
						>
							<Icon className="size-3" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{label}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
