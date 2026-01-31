import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniXMark } from "react-icons/hi2";

interface WorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
	onClose?: (e: React.MouseEvent) => void;
	isActive?: boolean;
}

export function WorkspaceDiffStats({
	additions,
	deletions,
	onClose,
	isActive,
}: WorkspaceDiffStatsProps) {
	return (
		<div
			className={cn(
				"group/diff flex items-center text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded relative cursor-pointer",
				isActive
					? "bg-foreground/10 group-hover:bg-transparent"
					: "bg-muted/50 group-hover:bg-transparent",
			)}
		>
			{/* Diff stats - hidden on card hover when onClose provided */}
			<div
				className={
					onClose
						? "flex items-center gap-1.5 group-hover:hidden"
						: "flex items-center gap-1.5"
				}
			>
				<span className="text-emerald-500/90">+{additions}</span>
				<span className="text-red-400/90">−{deletions}</span>
			</div>
			{/* X icon - shown on card hover */}
			{onClose && (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onClose}
							className="hidden group-hover:flex items-center justify-center text-muted-foreground hover:text-foreground"
						>
							<HiMiniXMark className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						Close workspace
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
