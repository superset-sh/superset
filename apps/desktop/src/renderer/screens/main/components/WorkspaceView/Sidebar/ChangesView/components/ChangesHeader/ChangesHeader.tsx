import { Button } from "@superset/ui/button";
import { HiArrowPath } from "react-icons/hi2";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";

interface ChangesHeaderProps {
	branch: string;
	defaultBranch: string;
	ahead: number;
	behind: number;
	isRefreshing: boolean;
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
}

export function ChangesHeader({
	branch,
	defaultBranch,
	ahead,
	behind,
	isRefreshing,
	onRefresh,
	viewMode,
	onViewModeChange,
}: ChangesHeaderProps) {
	return (
		<div className="flex flex-col gap-2 px-3 py-2 border-b border-border">
			<div className="flex items-center justify-between">
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium truncate">{branch}</div>
					{(ahead > 0 || behind > 0) && (
						<div className="text-xs text-muted-foreground">
							{ahead > 0 && (
								<span className="text-green-500">{ahead} ahead</span>
							)}
							{ahead > 0 && behind > 0 && <span> / </span>}
							{behind > 0 && (
								<span className="text-yellow-500">{behind} behind</span>
							)}
							<span className="text-muted-foreground"> {defaultBranch}</span>
						</div>
					)}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onRefresh}
					disabled={isRefreshing}
					className="h-7 w-7 p-0"
				>
					<HiArrowPath
						className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>
			<ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
		</div>
	);
}
