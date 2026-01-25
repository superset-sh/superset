import { Button } from "@superset/ui/button";
import { formatDistanceToNow } from "date-fns";
import { LuGitBranch } from "react-icons/lu";

interface Worktree {
	id: string;
	branch: string;
	createdAt: number;
	hasActiveWorkspace: boolean;
}

interface WorktreesSectionProps {
	closedWorktrees: Worktree[];
	openWorktrees: Worktree[];
	onOpenWorktree: (worktreeId: string, branch: string) => void;
	onOpenAll: () => void;
	disabled: boolean;
}

export function WorktreesSection({
	closedWorktrees,
	openWorktrees,
	onOpenWorktree,
	onOpenAll,
	disabled,
}: WorktreesSectionProps) {
	return (
		<div className="space-y-1">
			<div className="border-t border-border pt-2" />
			<div className="flex items-center justify-between">
				<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
					Worktrees
				</div>
				{closedWorktrees.length > 1 && (
					<Button
						variant="ghost"
						size="sm"
						className="h-5 px-2 text-[10px]"
						onClick={onOpenAll}
						disabled={disabled}
					>
						Open All
					</Button>
				)}
			</div>

			{closedWorktrees.map((wt) => (
				<button
					key={wt.id}
					type="button"
					onClick={() => onOpenWorktree(wt.id, wt.branch)}
					disabled={disabled}
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
	);
}
