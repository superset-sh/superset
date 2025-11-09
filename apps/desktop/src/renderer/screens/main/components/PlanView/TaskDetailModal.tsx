import type { RouterOutputs } from "@superset/api";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type React from "react";

type Task = RouterOutputs["task"]["all"][number];

interface TaskDetailModalProps {
	task: Task | null;
	isOpen: boolean;
	onClose: () => void;
}

const statusColors: Record<string, string> = {
	backlog: "bg-neutral-500",
	todo: "bg-blue-500",
	planning: "bg-yellow-500",
	working: "bg-amber-500",
	"needs-feedback": "bg-orange-500",
	"ready-to-merge": "bg-emerald-500",
	completed: "bg-green-600",
	canceled: "bg-red-500",
};

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
	task,
	isOpen,
	onClose,
}) => {
	if (!task) return null;

	const statusLabels: Record<string, string> = {
		backlog: "Backlog",
		todo: "Todo",
		planning: "In Progress",
		working: "Working",
		"needs-feedback": "Needs Feedback",
		"ready-to-merge": "Ready to Merge",
		completed: "Completed",
		canceled: "Canceled",
	};

	const statusColor = statusColors[task.status] || "bg-neutral-500";

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-neutral-900 border-neutral-800/50 shadow-2xl">
				{/* Header */}
				<DialogHeader className="border-b border-neutral-800/50 pb-5">
					<div className="flex items-center gap-2.5 mb-3">
						<span className="text-xs font-semibold text-neutral-500 tracking-wide">
							{task.slug}
						</span>
						<div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-neutral-800/50 text-neutral-400 border border-neutral-800">
							<div
								className={`w-1.5 h-1.5 rounded-full ${statusColor} shadow-sm`}
							/>
							<span className="font-medium">
								{statusLabels[task.status] || task.status}
							</span>
						</div>
					</div>
					<DialogTitle className="text-xl font-semibold text-white leading-tight">
						{task.title}
					</DialogTitle>
				</DialogHeader>

				{/* Content */}
				<div className="space-y-6 py-5">
					{/* Description */}
					{task.description && (
						<div>
							<h3 className="text-sm font-semibold text-neutral-400 mb-3">
								Description
							</h3>
							<p className="text-sm text-neutral-300 leading-relaxed">
								{task.description}
							</p>
						</div>
					)}

					{/* Metadata */}
					<div className="grid grid-cols-2 gap-5">
						{/* Assignee */}
						{task.assignee && (
							<div>
								<h3 className="text-sm font-semibold text-neutral-400 mb-3">
									Assignee
								</h3>
								<div className="flex items-center gap-2.5">
									<img
										src={
											task.assignee.avatarUrl ||
											"https://via.placeholder.com/32"
										}
										alt={task.assignee.name}
										className="w-7 h-7 rounded-full ring-2 ring-neutral-800"
									/>
									<span className="text-sm text-neutral-300 font-medium">
										{task.assignee.name}
									</span>
								</div>
							</div>
						)}

						{/* Creator */}
						{task.creator && (
							<div>
								<h3 className="text-sm font-semibold text-neutral-400 mb-3">
									Created by
								</h3>
								<div className="flex items-center gap-2.5">
									<img
										src={
											task.creator.avatarUrl || "https://via.placeholder.com/32"
										}
										alt={task.creator.name}
										className="w-7 h-7 rounded-full ring-2 ring-neutral-800"
									/>
									<span className="text-sm text-neutral-300 font-medium">
										{task.creator.name}
									</span>
								</div>
							</div>
						)}
					</div>

					{/* Branch */}
					{task.branch && (
						<div>
							<h3 className="text-sm font-semibold text-neutral-400 mb-3">
								Branch
							</h3>
							<code className="text-sm text-neutral-300 bg-neutral-800/50 border border-neutral-800 px-3 py-1.5 rounded-lg font-mono">
								{task.branch}
							</code>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
