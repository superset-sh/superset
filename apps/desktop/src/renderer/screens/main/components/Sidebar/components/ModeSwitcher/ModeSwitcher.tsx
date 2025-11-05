import { Code, KanbanSquare } from "lucide-react";

export type ViewMode = "code" | "plan";

interface ModeSwitcherProps {
	mode: ViewMode;
	onModeChange: (mode: ViewMode) => void;
}

export function ModeSwitcher({ mode, onModeChange }: ModeSwitcherProps) {
	return (
		<div className="flex items-center gap-1 px-3 pb-3">
			<button
				type="button"
				onClick={() => onModeChange("code")}
				className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
					mode === "code"
						? "bg-neutral-700 text-white"
						: "text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800"
				}`}
			>
				<Code size={16} />
				<span>Code</span>
			</button>
			<button
				type="button"
				onClick={() => onModeChange("plan")}
				className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
					mode === "plan"
						? "bg-neutral-700 text-white"
						: "text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800"
				}`}
			>
				<KanbanSquare size={16} />
				<span>Plan</span>
			</button>
		</div>
	);
}
