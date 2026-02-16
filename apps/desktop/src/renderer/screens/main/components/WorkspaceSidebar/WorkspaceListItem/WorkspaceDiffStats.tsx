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
				"group/diff relative flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-mono tabular-nums cursor-pointer",
				isActive
					? "bg-foreground/10 group-hover:bg-transparent"
					: "bg-muted/50 group-hover:bg-transparent",
			)}
		>
			<div
				className={cn(
					"flex items-center gap-1.5 leading-none transition-opacity",
					onClose && "group-hover:opacity-0",
				)}
			>
				<span className="text-emerald-500/90">+{additions}</span>
				<span className="text-red-400/90">−{deletions}</span>
			</div>
			{onClose && (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onClose}
							className="absolute inset-0 flex items-center justify-center text-muted-foreground leading-none opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-foreground"
							aria-label="Close workspace"
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
