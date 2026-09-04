import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { FoldVertical, UnfoldVertical } from "lucide-react";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { Branch, Commit } from "../../types";
import { BaseBranchSelector } from "../BaseBranchSelector";
import { CommitFilterDropdown } from "../CommitFilterDropdown";
import { ViewModeToggle } from "./components/ViewModeToggle";

interface ChangesToolbarProps {
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount: number;
	viewMode: ChangesViewMode;
	onViewModeChange: (next: ChangesViewMode) => void;
	/** Whether the last fold action was "collapse all". */
	collapsed: boolean;
	/** Toggle between collapse-all and expand-all across every section. */
	onToggleFold: () => void;
	baseBranch: string;
	branches: Branch[];
	onBaseBranchChange: (branchName: string) => void;
	currentBranchName: string;
	canRenameBranch: boolean;
	onRenameBranch: (newName: string) => void;
}

/**
 * The panel's one control row: a scope sentence on the left — the diff
 * filter, then "vs <base>" while the scope is actually measured against the
 * base — and the view-mode / fold utilities right-aligned. Branch identity
 * and rename live inside the scope dropdown; counts and diffstats live on
 * the section headers. The fold action applies to every section's folder
 * groups (folders mode) or tree directories (tree mode).
 */
export function ChangesToolbar({
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
	viewMode,
	onViewModeChange,
	collapsed,
	onToggleFold,
	baseBranch,
	branches,
	onBaseBranchChange,
	currentBranchName,
	canRenameBranch,
	onRenameBranch,
}: ChangesToolbarProps) {
	const { t } = useLingui();
	const label = collapsed
		? t({ message: "Expand all" })
		: t({
				message: "Collapse all",
			});
	const Icon = collapsed ? UnfoldVertical : FoldVertical;
	return (
		<div className="flex min-w-0 items-center gap-1 overflow-hidden py-1 pr-1 pl-1.5 text-xs">
			<CommitFilterDropdown
				filter={filter}
				onFilterChange={onFilterChange}
				commits={commits}
				uncommittedCount={uncommittedCount}
				currentBranchName={currentBranchName}
				canRenameBranch={canRenameBranch}
				onRenameBranch={onRenameBranch}
			/>
			{filter.kind === "all" && (
				// Selector as a placeholder in the message: a bare "vs" cannot
				// precede the branch in every language.
				<span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
					<Trans>
						<span className="shrink-0 text-muted-foreground/60">vs</span>{" "}
						<BaseBranchSelector
							branches={branches}
							currentValue={baseBranch}
							onChange={onBaseBranchChange}
						/>
					</Trans>
				</span>
			)}
			<div className="ml-auto flex shrink-0 items-center gap-0.5">
				<ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground"
							onClick={onToggleFold}
							aria-label={label}
						>
							<Icon className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{label}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
