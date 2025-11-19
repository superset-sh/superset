import { Sparkles } from "lucide-react";

import type { FileDiff } from "./types";

interface DiffSummaryProps {
	summary: string;
	status: FileDiff["status"];
}

export function DiffSummary({ summary, status }: DiffSummaryProps) {
	const getBgColor = () => {
		switch (status) {
			case "added":
				return "bg-emerald-500/5";
			case "deleted":
				return "bg-rose-500/5";
			case "modified":
				return "bg-amber-500/5";
			default:
				return "bg-white/[0.02]";
		}
	};

	const getIconColor = () => {
		switch (status) {
			case "added":
				return "text-emerald-400/60";
			case "deleted":
				return "text-rose-400/60";
			case "modified":
				return "text-amber-400/60";
			default:
				return "text-zinc-500";
		}
	};

	return (
		<div
			className={`rounded-md p-2 ${getBgColor()} border border-white/[0.03]`}
		>
			<div className="flex items-start gap-2">
				<Sparkles className={`w-3 h-3 mt-0.5 shrink-0 ${getIconColor()}`} />
				<div className="flex-1 min-w-0">
					<p className="text-[10px] text-zinc-400 leading-relaxed">{summary}</p>
				</div>
			</div>
		</div>
	);
}
