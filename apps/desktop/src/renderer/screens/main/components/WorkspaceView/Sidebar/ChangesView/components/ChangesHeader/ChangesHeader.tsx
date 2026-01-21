import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
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
import { LuExpand, LuLoaderCircle, LuShrink, LuX } from "react-icons/lu";
import { VscGitStash, VscGitStashApply } from "react-icons/vsc";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { usePRStatus } from "renderer/screens/main/hooks";
import { useChangesStore } from "renderer/stores/changes";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";

interface ChangesHeaderProps {
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
	worktreePath: string;
	workspaceId?: string;
	onStash: () => void;
	onStashIncludeUntracked: () => void;
	onStashPop: () => void;
	isStashPending: boolean;
}

function BaseBranchSelector({ worktreePath }: { worktreePath: string }) {
	const { baseBranch, setBaseBranch } = useChangesStore();
	const { data: branchData, isLoading } =
		electronTrpc.changes.getBranches.useQuery(
			{ worktreePath },
			{ enabled: !!worktreePath },
		);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";
	const sortedBranches = [...(branchData?.remote ?? [])].sort((a, b) => {
		if (a === branchData?.defaultBranch) return -1;
		if (b === branchData?.defaultBranch) return 1;
		return a.localeCompare(b);
	});

	const handleChange = (value: string) => {
		if (value === branchData?.defaultBranch && baseBranch === null) return;
		setBaseBranch(value);
	};

	if (isLoading || !branchData) {
		return (
			<span className="px-1.5 py-0.5 rounded bg-muted/50 text-foreground text-[10px] font-medium truncate">
				{effectiveBaseBranch}
			</span>
		);
	}

	return (
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
									<span className="ml-1 text-muted-foreground">(default)</span>
								)}
							</SelectItem>
						))}
				</SelectContent>
			</Select>
			<TooltipContent side="bottom" showArrow={false}>
				Change base branch
			</TooltipContent>
		</Tooltip>
	);
}

function StashDropdown({
	onStash,
	onStashIncludeUntracked,
	onStashPop,
	isPending,
}: {
	onStash: () => void;
	onStashIncludeUntracked: () => void;
	onStashPop: () => void;
	isPending: boolean;
}) {
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6 p-0"
							disabled={isPending}
						>
							<VscGitStash className="size-4" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Stash operations
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-52">
				<DropdownMenuItem onClick={onStash} className="text-xs">
					<VscGitStash className="size-4" />
					Stash Changes
				</DropdownMenuItem>
				<DropdownMenuItem onClick={onStashIncludeUntracked} className="text-xs">
					<VscGitStash className="size-4" />
					Stash (Include Untracked)
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onStashPop} className="text-xs">
					<VscGitStashApply className="size-4" />
					Pop Stash
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
	const [isSpinning, setIsSpinning] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const handleClick = () => {
		setIsSpinning(true);
		onRefresh();
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(() => setIsSpinning(false), 600);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleClick}
					disabled={isSpinning}
					className="size-6 p-0"
				>
					<HiArrowPath
						className={`size-3.5 ${isSpinning ? "animate-spin" : ""}`}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				Refresh changes
			</TooltipContent>
		</Tooltip>
	);
}

function PRStatusLink({ workspaceId }: { workspaceId?: string }) {
	const { pr, isLoading } = usePRStatus({
		workspaceId,
		refetchInterval: 10000,
	});

	if (isLoading) {
		return (
			<LuLoaderCircle className="w-4 h-4 animate-spin text-muted-foreground" />
		);
	}

	if (!pr) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<a
					href={pr.url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 hover:opacity-80 transition-opacity"
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
	);
}

export function ChangesHeader({
	onRefresh,
	viewMode,
	onViewModeChange,
	worktreePath,
	workspaceId,
	onStash,
	onStashIncludeUntracked,
	onStashPop,
	isStashPending,
}: ChangesHeaderProps) {
	const { toggleSidebar, currentMode, setMode } = useSidebarStore();
	const isExpanded = currentMode === SidebarMode.Changes;

	const handleExpandToggle = () => {
		setMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
	};

	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-1.5 px-2 py-1.5">
				<span className="text-[10px] text-muted-foreground shrink-0">
					Base:
				</span>
				<BaseBranchSelector worktreePath={worktreePath} />
				<div className="flex-1" />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleExpandToggle}
							className="size-6 p-0"
						>
							{isExpanded ? (
								<LuShrink className="size-3.5" />
							) : (
								<LuExpand className="size-3.5" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{isExpanded ? "Collapse sidebar" : "Expand sidebar"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleSidebar}
							className="size-6 p-0"
						>
							<LuX className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						<HotkeyTooltipContent
							label="Close Changes Sidebar"
							hotkeyId="TOGGLE_SIDEBAR"
						/>
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="flex items-center gap-0.5 px-2 pb-1.5">
				<StashDropdown
					onStash={onStash}
					onStashIncludeUntracked={onStashIncludeUntracked}
					onStashPop={onStashPop}
					isPending={isStashPending}
				/>
				<ViewModeToggle
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
				/>
				<RefreshButton onRefresh={onRefresh} />
				<PRStatusLink workspaceId={workspaceId} />
			</div>
		</div>
	);
}
