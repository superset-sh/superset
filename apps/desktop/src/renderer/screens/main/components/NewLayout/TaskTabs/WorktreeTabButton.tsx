import { Loader2 } from "lucide-react";
import type React from "react";
import { StatusIndicator } from "../StatusIndicator";
import type { WorktreeWithTask } from "./types";

interface WorktreeTabButtonProps {
	worktree: WorktreeWithTask;
	isSelected: boolean;
	onClick: () => void;
}

export const WorktreeTabButton: React.FC<WorktreeTabButtonProps> = ({
	worktree,
	isSelected,
	onClick,
}) => {
	const hasTask = !!worktree.task;
	const task = worktree.task;
	const isPending = worktree.isPending;
	const displayTitle =
		hasTask && task ? task.slug : worktree.description || worktree.branch;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isPending}
			className={`
				flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x
				${
					isSelected
						? "bg-neutral-900 text-white border-neutral-700 -mb-px"
						: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
				}
				${isPending ? "opacity-70 cursor-wait" : ""}
			`}
		>
			{isPending ? (
				<Loader2 size={14} className="animate-spin text-blue-400" />
			) : (
				hasTask && task && <StatusIndicator status={task.status} showLabel={false} />
			)}
			<span className="text-sm whitespace-nowrap">
				{hasTask && task ? `[${task.slug}] ${task.title}` : displayTitle}
			</span>
		</button>
	);
};
