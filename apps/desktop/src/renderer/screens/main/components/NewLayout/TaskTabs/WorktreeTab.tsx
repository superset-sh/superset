import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import type React from "react";
import { BasicWorktreeContent } from "./BasicWorktreeContent";
import { PendingWorktreeContent } from "./PendingWorktreeContent";
import { TaskWorktreeContent } from "./TaskWorktreeContent";
import type { WorktreeWithTask } from "./types";
import { WorktreeTabButton } from "./WorktreeTabButton";

interface WorktreeTabProps {
	worktree: WorktreeWithTask;
	isSelected: boolean;
	onSelect: () => void;
}

export const WorktreeTab: React.FC<WorktreeTabProps> = ({
	worktree,
	isSelected,
	onSelect,
}) => {
	const isPending = worktree.isPending;
	const hasTask = !!worktree.task;
	const task = worktree.task;

	return (
		<HoverCard key={worktree.id} openDelay={200}>
			<HoverCardTrigger asChild>
				<WorktreeTabButton
					worktree={worktree}
					isSelected={isSelected}
					onClick={onSelect}
				/>
			</HoverCardTrigger>
			<HoverCardContent side="bottom" align="start" className="w-96">
				{isPending ? (
					<PendingWorktreeContent />
				) : hasTask && task ? (
					<TaskWorktreeContent worktree={worktree} task={task} />
				) : (
					<BasicWorktreeContent worktree={worktree} />
				)}
			</HoverCardContent>
		</HoverCard>
	);
};
