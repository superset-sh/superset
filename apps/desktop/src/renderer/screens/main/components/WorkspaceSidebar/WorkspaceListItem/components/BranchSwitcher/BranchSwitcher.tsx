import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuGitBranch, LuGitFork, LuLoader } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "../../../constants";

interface BranchSwitcherProps {
	projectId: string;
	currentBranch: string;
	className?: string;
}

export function BranchSwitcher({
	projectId,
	currentBranch,
	className,
}: BranchSwitcherProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");

	const utils = trpc.useUtils();
	const navigate = useNavigate();

	// Fetch branches when dropdown opens
	const { data: branchesData, isLoading } =
		trpc.workspaces.getBranches.useQuery(
			{ projectId, fetch: false },
			{ enabled: isOpen },
		);

	const switchBranch = trpc.workspaces.switchBranchWorkspace.useMutation({
		onSuccess: () => {
			utils.workspaces.invalidate();
		},
	});

	// Branches in use by worktrees (branch -> workspaceId)
	const inUseWorkspaces = useMemo(() => {
		return branchesData?.inUseWorkspaces ?? {};
	}, [branchesData]);

	// Set of branch names in use for quick lookup
	const inUseBranches = useMemo(() => {
		return new Set(Object.keys(inUseWorkspaces));
	}, [inUseWorkspaces]);

	// Combine and dedupe branches, prioritize main/master
	const branches = useMemo(() => {
		if (!branchesData) return [];

		const allBranches = new Set([
			...branchesData.local,
			...branchesData.remote,
		]);
		const sorted = Array.from(allBranches).sort((a, b) => {
			// Prioritize main/master/develop
			const priority = ["main", "master", "develop"];
			const aIndex = priority.indexOf(a);
			const bIndex = priority.indexOf(b);
			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			// Then prioritize branches in use
			const aInUse = inUseBranches.has(a);
			const bInUse = inUseBranches.has(b);
			if (aInUse && !bInUse) return -1;
			if (!aInUse && bInUse) return 1;
			return a.localeCompare(b);
		});
		return sorted;
	}, [branchesData, inUseBranches]);

	// Filter by search
	const filteredBranches = useMemo(() => {
		if (!search.trim()) return branches;
		const term = search.toLowerCase();
		return branches.filter((b) => b.toLowerCase().includes(term));
	}, [branches, search]);

	const handleBranchClick = (branch: string) => {
		if (branch === currentBranch) {
			setIsOpen(false);
			return;
		}

		// If branch is in use by a worktree, jump to that workspace
		const worktreeWorkspaceId = inUseWorkspaces[branch];
		if (worktreeWorkspaceId) {
			navigateToWorkspace(worktreeWorkspaceId, navigate);
			setIsOpen(false);
			return;
		}

		// Otherwise switch this workspace to the new branch
		toast.promise(switchBranch.mutateAsync({ projectId, branch }), {
			loading: `Switching to ${branch}...`,
			success: `Switched to ${branch}`,
			error: (err) =>
				err instanceof Error ? err.message : "Failed to switch branch",
		});
		setIsOpen(false);
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-0.5 px-1 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
						isOpen && "bg-muted/50 text-foreground",
						className,
					)}
					onClick={(e) => e.stopPropagation()}
				>
					<HiChevronUpDown className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-56 max-h-80 overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search input */}
				<div className="p-2 border-b border-border">
					<Input
						placeholder="Search branches..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-7 text-xs"
						autoFocus
					/>
				</div>

				{/* Branch list */}
				<div className="overflow-y-auto flex-1 py-1">
					{isLoading ? (
						<div className="flex items-center justify-center py-4">
							<LuLoader
								className="size-4 animate-spin text-muted-foreground"
								strokeWidth={STROKE_WIDTH}
							/>
						</div>
					) : filteredBranches.length === 0 ? (
						<div className="text-center py-4 text-xs text-muted-foreground">
							{search ? "No branches match" : "No branches found"}
						</div>
					) : (
						<>
							{filteredBranches.slice(0, 50).map((branch) => {
								const isDefault = ["main", "master", "develop"].includes(
									branch,
								);
								const isCurrent = branch === currentBranch;
								const isInUse = inUseBranches.has(branch);

								return (
									<DropdownMenuItem
										key={branch}
										onClick={() => handleBranchClick(branch)}
										disabled={switchBranch.isPending}
										className="flex items-center gap-2 px-2 py-1.5"
									>
										{isInUse ? (
											<LuGitFork
												className="size-3.5 shrink-0 text-amber-500"
												strokeWidth={STROKE_WIDTH}
											/>
										) : (
											<LuGitBranch
												className="size-3.5 shrink-0 text-muted-foreground"
												strokeWidth={STROKE_WIDTH}
											/>
										)}
										<span className="flex-1 truncate text-xs">{branch}</span>
										{isInUse && (
											<span className="text-[10px] text-amber-500">
												worktree
											</span>
										)}
										{isDefault && !isInUse && (
											<span className="text-[10px] text-muted-foreground">
												default
											</span>
										)}
										{isCurrent && (
											<HiCheck className="size-3.5 shrink-0 text-primary" />
										)}
									</DropdownMenuItem>
								);
							})}
							{filteredBranches.length > 50 && (
								<>
									<DropdownMenuSeparator />
									<div className="text-center py-2 text-xs text-muted-foreground">
										{filteredBranches.length - 50} more branches...
									</div>
								</>
							)}
						</>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
