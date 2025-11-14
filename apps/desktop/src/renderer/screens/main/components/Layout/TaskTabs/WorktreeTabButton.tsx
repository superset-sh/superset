import { Loader2, X } from "lucide-react";
import type React from "react";
import { StatusIndicator } from "../StatusIndicator";
import type { WorktreeWithTask } from "./types";

interface WorktreeTabButtonProps {
	worktree: WorktreeWithTask;
	isSelected: boolean;
	onClick: () => void;
	onClose?: (e: React.MouseEvent) => void;
	width?: number;
}

export const WorktreeTabButton: React.FC<WorktreeTabButtonProps> = ({
	worktree,
	isSelected,
	onClick,
	onClose,
	width,
}) => {
	const hasTask = !!worktree.task;
	const task = worktree.task;
	const isPending = worktree.isPending;

	return (
		<div 
			className="group relative flex items-end shrink-0" 
			style={{ width: width ? `${width}px` : undefined }}
		>
			<button
				type="button"
				onClick={onClick}
				disabled={isPending}
				className={`
					flex items-center gap-2 rounded-t-md transition-all w-full relative shrink-0
					${onClose && !isPending ? "pl-3 pr-6" : "px-3"}
					${isSelected
						? "text-white border-t border-x border-r h-[33px] border-b-2 border-b-black bg-transparent"
						: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 border-transparent h-8"
					}
					${isPending ? "opacity-70 cursor-wait" : ""}
				`}
				style={{
					minWidth: width ? undefined : "60px",
					maxWidth: width ? `${width}px` : "240px",
					...(isSelected && {
						marginBottom: "-2px",
					}),
				}}
			>
				{isPending ? (
					<Loader2 size={14} className="animate-spin text-blue-400" />
				) : (
					hasTask &&
					task && <StatusIndicator status={task.status} showLabel={false} />
				)}
				<span className="text-sm whitespace-nowrap truncate flex-1 text-left">
					{hasTask && task ? `${task.title} (${worktree.branch})` : worktree.branch}
				</span>
			</button>
			{onClose && !isPending && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onClose(e);
					}}
					className={`
						absolute right-1 top-1/2 -translate-y-1/2
						flex items-center justify-center
						w-4 h-4 rounded
						transition-opacity cursor-pointer
						hover:bg-neutral-700
						${isSelected 
							? "opacity-100 text-neutral-300" 
							: "opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-200"
						}
					`}
					aria-label="Close tab"
				>
					<X size={12} />
				</button>
			)}
		</div>
	);
};
