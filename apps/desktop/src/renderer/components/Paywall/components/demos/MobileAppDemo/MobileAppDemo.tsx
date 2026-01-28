import { HiCheck } from "react-icons/hi2";

const MOBILE_TASKS = [
	{ id: "1", title: "Review PR #142", status: "done" },
	{ id: "2", title: "Fix auth bug", status: "in-progress" },
	{ id: "3", title: "Update docs", status: "todo" },
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

export function MobileAppDemo() {
	return (
		<div className="flex items-center justify-center">
			{/* Phone frame */}
			<div className="relative w-[140px] h-[280px] bg-[#0a0a0a] rounded-[24px] border-4 border-[#2a2a2a] shadow-2xl overflow-hidden">
				{/* Notch */}
				<div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 bg-[#0a0a0a] rounded-b-xl z-10" />

				{/* Screen content */}
				<div className="absolute inset-1 bg-[#1a1a1a] rounded-[20px] overflow-hidden">
					{/* Status bar */}
					<div className="flex items-center justify-between px-4 pt-6 pb-2">
						<span className="text-[8px] text-white/50">9:41</span>
						<div className="flex items-center gap-1">
							<div className="w-3 h-1.5 border border-white/50 rounded-sm">
								<div className="w-2 h-full bg-white/50 rounded-sm" />
							</div>
						</div>
					</div>

					{/* App header */}
					<div className="px-3 pb-2 border-b border-white/5">
						<span className="text-[10px] font-semibold text-white/90">
							Superset
						</span>
					</div>

					{/* Workspace indicator */}
					<div className="px-3 py-2 bg-white/5">
						<div className="text-[8px] text-white/40 uppercase tracking-wider">
							Current Workspace
						</div>
						<div className="text-[10px] text-white/80 font-medium">
							superset-app
						</div>
					</div>

					{/* Tasks */}
					<div className="p-2 space-y-1">
						<div className="text-[8px] text-white/40 uppercase tracking-wider px-1 mb-1">
							Tasks
						</div>
						{MOBILE_TASKS.map((task) => (
							<div
								key={task.id}
								className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-white/5"
							>
								{task.status === "done" ? (
									<div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30 flex items-center justify-center">
										<HiCheck className="w-1.5 h-1.5 text-emerald-400" />
									</div>
								) : task.status === "in-progress" ? (
									<SpinnerIcon className="w-2.5 h-2.5 text-amber-400 animate-spin" />
								) : (
									<div className="w-2.5 h-2.5 rounded-full border border-white/20" />
								)}
								<span
									className={`text-[8px] truncate ${
										task.status === "done"
											? "text-white/40 line-through"
											: "text-white/70"
									}`}
								>
									{task.title}
								</span>
							</div>
						))}
					</div>

					{/* Bottom nav hint */}
					<div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/20 rounded-full" />
				</div>
			</div>
		</div>
	);
}
