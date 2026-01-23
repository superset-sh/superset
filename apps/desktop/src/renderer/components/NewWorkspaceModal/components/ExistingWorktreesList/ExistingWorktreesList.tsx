import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { LuGitBranch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import {
	useCreateWorkspace,
	useOpenWorktree,
} from "renderer/react-query/workspaces";

interface ExistingWorktreesListProps {
	projectId: string;
	onOpenSuccess: () => void;
}

export function ExistingWorktreesList({
	projectId,
	onOpenSuccess,
}: ExistingWorktreesListProps) {
	const { data: worktrees = [], isLoading: isWorktreesLoading } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery({ projectId });
	const { data: branchData, isLoading: isBranchesLoading } =
		electronTrpc.projects.getBranches.useQuery({ projectId });
	const openWorktree = useOpenWorktree();
	const createWorkspace = useCreateWorkspace();

	const closedWorktrees = worktrees
		.filter((wt) => !wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);
	const openWorktrees = worktrees
		.filter((wt) => wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);

	// Filter out branches that already have worktrees
	const branchesWithoutWorktrees = useMemo(() => {
		if (!branchData?.branches) return [];
		const worktreeBranches = new Set(worktrees.map((wt) => wt.branch));
		return branchData.branches.filter(
			(branch) => !worktreeBranches.has(branch.name),
		);
	}, [branchData?.branches, worktrees]);

	const handleOpenWorktree = async (worktreeId: string, branch: string) => {
		toast.promise(openWorktree.mutateAsync({ worktreeId }), {
			loading: "Opening workspace...",
			success: () => {
				onOpenSuccess();
				return `Opened ${branch}`;
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to open workspace",
		});
	};

	const handleOpenAll = async () => {
		if (closedWorktrees.length === 0) return;

		const count = closedWorktrees.length;
		toast.promise(
			(async () => {
				for (const wt of closedWorktrees) {
					await openWorktree.mutateAsync({ worktreeId: wt.id });
				}
			})(),
			{
				loading: `Opening ${count} workspaces...`,
				success: () => {
					onOpenSuccess();
					return `Opened ${count} workspaces`;
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to open workspaces",
			},
		);
	};

	const handleCreateFromBranch = async (branchName: string) => {
		try {
			const result = await createWorkspace.mutateAsync({
				projectId,
				branchName,
				useExistingBranch: true,
			});

			onOpenSuccess();

			if (result.isInitializing) {
				toast.success("Workspace created", {
					description: "Setting up in the background...",
				});
			} else {
				toast.success("Workspace created");
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	const isLoading = isWorktreesLoading || isBranchesLoading;
	const isPending = openWorktree.isPending || createWorkspace.isPending;

	if (isLoading) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				Loading...
			</div>
		);
	}

	const hasWorktrees = closedWorktrees.length > 0 || openWorktrees.length > 0;
	const hasBranches = branchesWithoutWorktrees.length > 0;

	if (!hasWorktrees && !hasBranches) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				No existing worktrees or branches.
				<br />
				Create a new branch to get started.
			</div>
		);
	}

	return (
		<div className="space-y-3 max-h-[300px] overflow-y-auto">
			{/* Worktrees Section */}
			{hasWorktrees && (
				<div className="space-y-1">
					<div className="flex items-center justify-between">
						<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
							Worktrees
						</div>
						{closedWorktrees.length > 1 && (
							<Button
								variant="ghost"
								size="sm"
								className="h-5 px-2 text-[10px]"
								onClick={handleOpenAll}
								disabled={isPending}
							>
								Open All
							</Button>
						)}
					</div>

					{closedWorktrees.map((wt) => (
						<button
							key={wt.id}
							type="button"
							onClick={() => handleOpenWorktree(wt.id, wt.branch)}
							disabled={isPending}
							className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-accent transition-colors disabled:opacity-50"
						>
							<LuGitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
							<span className="flex-1 text-sm truncate font-mono">
								{wt.branch}
							</span>
							<span className="text-xs text-muted-foreground shrink-0">
								{formatDistanceToNow(wt.createdAt, { addSuffix: false })}
							</span>
						</button>
					))}

					{openWorktrees.length > 0 && (
						<div className="pt-1">
							<div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider px-2 py-1">
								Already open
							</div>
							{openWorktrees.map((wt) => (
								<div
									key={wt.id}
									className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/60"
								>
									<LuGitBranch className="h-3.5 w-3.5 shrink-0" />
									<span className="flex-1 text-sm truncate font-mono">
										{wt.branch}
									</span>
									<span className="text-[10px] shrink-0">open</span>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Branches Section */}
			{hasBranches && (
				<div className="space-y-1">
					{hasWorktrees && <div className="border-t border-border pt-2 mt-2" />}
					<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
						Branches
					</div>
					{branchesWithoutWorktrees.map((branch) => (
						<button
							key={branch.name}
							type="button"
							onClick={() => handleCreateFromBranch(branch.name)}
							disabled={isPending}
							className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-accent transition-colors disabled:opacity-50"
						>
							<LuGitBranch className="h-3.5 w-3.5 text-blue-500 shrink-0" />
							<span className="flex-1 text-sm truncate font-mono">
								{branch.name}
							</span>
							{branch.name === branchData?.defaultBranch && (
								<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
									default
								</span>
							)}
							{branch.lastCommitDate > 0 && (
								<span className="text-xs text-muted-foreground shrink-0">
									{formatRelativeTime(branch.lastCommitDate)}
								</span>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
