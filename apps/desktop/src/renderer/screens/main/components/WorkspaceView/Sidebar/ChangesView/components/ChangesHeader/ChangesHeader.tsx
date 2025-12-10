import { Button } from "@superset/ui/button";
import { HiArrowPath } from "react-icons/hi2";

interface ChangesHeaderProps {
	branch: string;
	defaultBranch: string;
	ahead: number;
	behind: number;
	isRefreshing: boolean;
	onRefresh: () => void;
}

export function ChangesHeader({
	branch,
	defaultBranch,
	ahead,
	behind,
	isRefreshing,
	onRefresh,
}: ChangesHeaderProps) {
	return (
		<div className="flex items-center justify-between px-3 py-2 border-b border-border">
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium truncate">{branch}</div>
				{(ahead > 0 || behind > 0) && (
					<div className="text-xs text-muted-foreground">
						{ahead > 0 && <span className="text-green-500">{ahead} ahead</span>}
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
	);
}
