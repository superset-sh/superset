import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiArrowPath } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";

interface ChangesHeaderProps {
	ahead: number;
	behind: number;
	isRefreshing: boolean;
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
	worktreePath: string;
}

export function ChangesHeader({
	ahead: _ahead,
	behind: _behind,
	isRefreshing,
	onRefresh,
	viewMode,
	onViewModeChange,
	worktreePath,
}: ChangesHeaderProps) {
	const { baseBranch, setBaseBranch } = useChangesStore();

	const { data: branchData, isLoading } = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";
	const availableBranches = branchData?.remote ?? [];

	const sortedBranches = [...availableBranches].sort((a, b) => {
		if (a === branchData?.defaultBranch) return -1;
		if (b === branchData?.defaultBranch) return 1;
		return a.localeCompare(b);
	});

	const handleChange = (value: string) => {
		if (value === branchData?.defaultBranch && baseBranch === null) {
			return;
		}
		setBaseBranch(value);
	};

	return (
		<div className="flex flex-col gap-2.5 px-3 py-2.5 border-b border-border">
			<div className="flex flex-row items-center gap-1.5 flex-wrap flex-1 min-w-0 text-xs">
				{isLoading || !branchData ? (
					<span className="px-2 py-0.5 rounded-md bg-muted/50 text-foreground font-medium shrink-0">
						{effectiveBaseBranch}
					</span>
				) : (
					<Tooltip>
						<Select value={effectiveBaseBranch} onValueChange={handleChange}>
							<TooltipTrigger asChild>
								<SelectTrigger
									size="sm"
									className="h-6 px-2 py-0 text-xs font-medium border-none bg-muted/50 hover:bg-muted text-foreground min-w-0 w-auto gap-1 rounded-md"
								>
									<SelectValue />
								</SelectTrigger>
							</TooltipTrigger>
							<SelectContent align="start">
								{sortedBranches.map((branch) => (
									<SelectItem key={branch} value={branch} className="text-xs">
										{branch}
										{branch === branchData.defaultBranch && (
											<span className="ml-1 text-muted-foreground">
												(default)
											</span>
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<TooltipContent side="bottom" showArrow={false}>
							Change base branch
						</TooltipContent>
					</Tooltip>
				)}
				<ViewModeToggle
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
				/>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={onRefresh}
							disabled={isRefreshing}
							className="h-7 w-7 p-0 shrink-0"
						>
							<HiArrowPath
								className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Refresh changes
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
