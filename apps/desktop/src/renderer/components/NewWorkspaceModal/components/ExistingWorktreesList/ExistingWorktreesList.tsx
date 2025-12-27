import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { formatDistanceToNow } from "date-fns";
import { LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenWorktree } from "renderer/react-query/workspaces";

interface ExistingWorktreesListProps {
	projectId: string;
	onOpenSuccess: () => void;
}

export function ExistingWorktreesList({
	projectId,
	onOpenSuccess,
}: ExistingWorktreesListProps) {
	const { data: worktrees = [], isLoading } =
		trpc.workspaces.getWorktreesByProject.useQuery({ projectId });
	const openWorktree = useOpenWorktree();

	const closedWorktrees = worktrees
		.filter((wt) => !wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);
	const openWorktrees = worktrees
		.filter((wt) => wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);

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

	if (isLoading) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				Loading...
			</div>
		);
	}

	if (worktrees.length === 0) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				No worktrees yet. Create a new branch to get started.
			</div>
		);
	}

	if (closedWorktrees.length === 0) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				All worktrees are open.
				<br />
				Close a workspace to reopen it here.
			</div>
		);
	}

	return (
		<div className="space-y-1">
			{closedWorktrees.length > 1 && (
				<div className="flex items-center justify-end pb-1">
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-xs"
						onClick={handleOpenAll}
						disabled={openWorktree.isPending}
					>
						Open All
					</Button>
				</div>
			)}
			{closedWorktrees.map((wt) => (
				<button
					key={wt.id}
					type="button"
					onClick={() => handleOpenWorktree(wt.id, wt.branch)}
					disabled={openWorktree.isPending}
					className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-accent transition-colors disabled:opacity-50"
				>
					<LuGitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
					<span className="flex-1 text-sm truncate font-mono">{wt.branch}</span>
					<span className="text-xs text-muted-foreground shrink-0">
						{formatDistanceToNow(wt.createdAt, { addSuffix: false })}
					</span>
				</button>
			))}

			{openWorktrees.length > 0 && (
				<div className="pt-2 mt-2 border-t border-border">
					<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2 py-1">
						Already open
					</div>
					{openWorktrees.map((wt) => (
						<div
							key={wt.id}
							className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground"
						>
							<LuGitBranch className="h-3.5 w-3.5 shrink-0" />
							<span className="flex-1 text-sm truncate font-mono">
								{wt.branch}
							</span>
							<span className="text-xs shrink-0">open</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
