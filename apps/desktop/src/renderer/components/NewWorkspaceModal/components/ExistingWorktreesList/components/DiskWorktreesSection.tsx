import { LuGitBranch } from "react-icons/lu";

interface DiskWorktree {
	path: string;
	branch: string;
}

interface DiskWorktreesSectionProps {
	diskWorktrees: DiskWorktree[];
	onOpenWorktree: (path: string, branch: string) => void;
	disabled: boolean;
}

export function DiskWorktreesSection({
	diskWorktrees,
	onOpenWorktree,
	disabled,
}: DiskWorktreesSectionProps) {
	return (
		<div className="space-y-1">
			<div className="border-t border-border pt-2" />
			<div className="flex items-center justify-between">
				<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
					Disk Worktrees
				</div>
			</div>

			{diskWorktrees.map((wt) => (
				<button
					key={wt.path}
					type="button"
					onClick={() => onOpenWorktree(wt.path, wt.branch)}
					disabled={disabled}
					className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left hover:bg-accent transition-colors disabled:opacity-50"
				>
					<LuGitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
					<div className="flex-1 min-w-0">
						<div className="text-xs font-mono truncate">{wt.branch}</div>
						<div
							className="text-[10px] text-muted-foreground/60 truncate"
							title={wt.path}
						>
							{wt.path}
						</div>
					</div>
				</button>
			))}
		</div>
	);
}
