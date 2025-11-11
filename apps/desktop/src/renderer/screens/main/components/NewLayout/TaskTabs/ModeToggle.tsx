import type React from "react";

interface ModeToggleProps {
	mode: "plan" | "edit";
	onChange: (mode: "plan" | "edit") => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => (
	<div className="flex items-center mr-3">
		<div className="inline-flex rounded-lg bg-neutral-800/50 p-0.5 gap-0.5">
			<button
				type="button"
				onClick={() => onChange("plan")}
				className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
					mode === "plan"
						? "bg-neutral-700 text-white"
						: "text-neutral-400 hover:text-neutral-200"
				}`}
			>
				Plan
			</button>
			<button
				type="button"
				onClick={() => onChange("edit")}
				className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
					mode === "edit"
						? "bg-neutral-700 text-white"
						: "text-neutral-400 hover:text-neutral-200"
				}`}
			>
				Edit
			</button>
		</div>
	</div>
);
