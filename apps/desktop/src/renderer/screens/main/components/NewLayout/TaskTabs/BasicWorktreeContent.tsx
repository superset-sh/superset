import type React from "react";
import type { WorktreeWithTask } from "./types";

interface BasicWorktreeContentProps {
	worktree: WorktreeWithTask;
}

export const BasicWorktreeContent: React.FC<BasicWorktreeContentProps> = ({
	worktree,
}) => {
	const displayTitle = worktree.description || worktree.branch;

	return (
		<div className="space-y-2">
			<div>
				<span className="text-xs font-semibold text-neutral-500">Worktree</span>
				<h4 className="text-sm font-semibold text-white mt-1">{displayTitle}</h4>
			</div>
			<div className="text-xs text-neutral-400 space-y-1">
				<div className="flex items-center gap-2">
					<span className="text-neutral-500">Branch:</span>
					<code className="text-neutral-300 font-mono">{worktree.branch}</code>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-neutral-500">Tabs:</span>
					<span className="text-neutral-300">{worktree.tabs?.length || 0} open</span>
				</div>
			</div>
		</div>
	);
};
