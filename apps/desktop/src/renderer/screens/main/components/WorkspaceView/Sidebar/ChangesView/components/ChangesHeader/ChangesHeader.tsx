import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { LuLoaderCircle } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { usePRStatus } from "renderer/screens/main/hooks";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";

interface ChangesHeaderProps {
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
	worktreePath: string;
	workspaceId?: string;
}

export function ChangesHeader({
	onRefresh,
	viewMode,
	onViewModeChange,
	worktreePath,
	workspaceId,
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

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		};
	}, []);

	const { baseBranch, setBaseBranch } = useChangesStore();

	const { data: branchData, isLoading } =
		electronTrpc.changes.getBranches.useQuery(
			{ worktreePath },
			{ enabled: !!worktreePath },
		);

	const { pr, isLoading: isPRLoading } = usePRStatus({
		workspaceId,
		refetchInterval: 10000,
	});

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

				{/* PR Status Icon */}
				{isPRLoading ? (
					<LuLoaderCircle className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
				) : pr ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<a
								href={pr.url}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1 shrink-0 hover:opacity-80 transition-opacity"
							>
								<PRIcon state={pr.state} className="w-4 h-4" />
								<span className="text-xs text-muted-foreground font-mono">
									#{pr.number}
								</span>
							</a>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							View PR on GitHub
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		</div>
	);
}
