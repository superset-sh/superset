import { HiCheck } from "react-icons/hi2";

const TASKS = [
	{
		id: "1",
		title: "Implement auth flow",
		status: "done",
		priority: "high",
	},
	{
		id: "2",
		title: "Add workspace sync",
		status: "in-progress",
		priority: "high",
	},
	{
		id: "3",
		title: "Fix mobile layout",
		status: "in-progress",
		priority: "medium",
	},
	{
		id: "4",
		title: "Update API docs",
		status: "todo",
		priority: "low",
	},
];

function SpinnerIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
}

const priorityColors = {
	high: "bg-red-500",
	medium: "bg-amber-500",
	low: "bg-blue-500",
};

export function TasksDemo() {
	return (
		<div className="w-full max-w-[280px] bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a]/80 border-b border-white/5">
				<div className="flex items-center gap-2">
					<div className="flex gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
					</div>
					<span className="text-xs text-white/60 ml-1">Tasks</span>
				</div>
				<span className="text-[10px] text-white/40">4 tasks</span>
			</div>

			{/* Task list */}
			<div className="p-3 space-y-1.5">
				{TASKS.map((task) => (
					<div
						key={task.id}
						className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-white/5 hover:bg-white/[0.07] transition-colors cursor-pointer"
					>
						{/* Status indicator */}
						{task.status === "done" ? (
							<div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
								<HiCheck className="w-2.5 h-2.5 text-emerald-400" />
							</div>
						) : task.status === "in-progress" ? (
							<SpinnerIcon className="w-4 h-4 text-amber-400 animate-spin" />
						) : (
							<div className="w-4 h-4 rounded-full border border-white/20" />
						)}

						{/* Task title */}
						<span
							className={`text-xs flex-1 truncate ${
								task.status === "done"
									? "text-white/40 line-through"
									: "text-white/80"
							}`}
						>
							{task.title}
						</span>

						{/* Priority dot */}
						<div
							className={`w-1.5 h-1.5 rounded-full ${priorityColors[task.priority as keyof typeof priorityColors]}`}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
