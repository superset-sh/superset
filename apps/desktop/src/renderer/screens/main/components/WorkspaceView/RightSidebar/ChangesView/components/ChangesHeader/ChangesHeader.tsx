import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { HiArrowPath, HiCheck } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { VscGitStash, VscGitStashApply } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";
import { PRButton } from "./components/PRButton";

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
	const { getBaseBranch, setBaseBranch } = useChangesStore();
	const baseBranch = getBaseBranch(worktreePath);
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

	const handleBranchSelect = (branch: string) => {
		if (branch === branchData?.defaultBranch) {
			setBaseBranch(worktreePath, null);
		} else {
			setBaseBranch(worktreePath, branch);
		}
	};

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6 p-0"
							disabled={isLoading}
						>
							<LuGitBranch className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Change base branch
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
					Current base branch
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{sortedBranches
					.filter((branch) => branch)
					.map((branch) => (
						<DropdownMenuItem
							key={branch}
							onClick={() => handleBranchSelect(branch)}
							className="flex items-center justify-between text-xs"
						>
							<span className="truncate">
								{branch}
								{branch === branchData?.defaultBranch && (
									<span className="ml-1 text-muted-foreground">(default)</span>
								)}
							</span>
							{branch === effectiveBaseBranch && (
								<HiCheck className="size-3.5 shrink-0 text-primary" />
							)}
						</DropdownMenuItem>
					))}
			</DropdownMenuContent>
		</DropdownMenu>
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
	return (
		<div className="flex items-center gap-0.5 px-2 py-1.5">
			<BaseBranchSelector worktreePath={worktreePath} />
			<StashDropdown
				onStash={onStash}
				onStashIncludeUntracked={onStashIncludeUntracked}
				onStashPop={onStashPop}
				isPending={isStashPending}
			/>
			<ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
			<RefreshButton onRefresh={onRefresh} />
			<PRButton
				workspaceId={workspaceId}
				worktreePath={worktreePath}
				onRefresh={onRefresh}
			/>
		</div>
	);
}
