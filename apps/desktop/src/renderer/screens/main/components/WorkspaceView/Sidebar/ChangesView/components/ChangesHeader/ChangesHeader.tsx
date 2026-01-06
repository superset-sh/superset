import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef, useState } from "react";
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
	isRefreshing: _isRefreshing,
	onRefresh,
	viewMode,
	onViewModeChange,
	worktreePath,
}: ChangesHeaderProps) {
	const [isManualRefresh, setIsManualRefresh] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const handleRefresh = () => {
		setIsManualRefresh(true);
		onRefresh();
		// Clear any existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}
		// Stop spinning after a short delay
		timeoutRef.current = setTimeout(() => {
			setIsManualRefresh(false);
		}, 600);
	};
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
		<div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
			<div className="flex items-center gap-1 min-w-0 flex-1">
				<span className="text-[10px] text-muted-foreground shrink-0">
					Base:
				</span>
				{isLoading || !branchData ? (
					<span className="px-1.5 py-0.5 rounded bg-muted/50 text-foreground text-[10px] font-medium truncate">
						{effectiveBaseBranch}
					</span>
				) : (
					<Tooltip>
						<Select value={effectiveBaseBranch} onValueChange={handleChange}>
							<TooltipTrigger asChild>
								<SelectTrigger
									size="sm"
									className="h-5 px-1.5 py-0 text-[10px] font-medium border-none bg-muted/50 hover:bg-muted text-foreground min-w-0 w-auto gap-0.5 rounded"
								>
									<SelectValue />
								</SelectTrigger>
							</TooltipTrigger>
							<SelectContent align="start">
								{sortedBranches
									.filter((branch) => branch)
									.map((branch) => (
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
			</div>
			<div className="flex items-center shrink-0">
				<ViewModeToggle
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
				/>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleRefresh}
							disabled={isManualRefresh}
							className="size-6 p-0"
						>
							<HiArrowPath
								className={`size-3.5 ${isManualRefresh ? "animate-spin" : ""}`}
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
