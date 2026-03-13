import { cn } from "@superset/ui/utils";
import { LuLoader, LuShieldCheck } from "react-icons/lu";
import { STROKE_WIDTH } from "../constants";

interface GreptileScoreBadgeProps {
	score: number | null;
	reviewing: boolean;
	className?: string;
}

function getScoreColor(score: number) {
	if (score >= 4) return { text: "text-emerald-500", bg: "bg-emerald-500/10" };
	if (score >= 3) return { text: "text-yellow-500", bg: "bg-yellow-500/10" };
	if (score >= 2) return { text: "text-orange-500", bg: "bg-orange-500/10" };
	return { text: "text-destructive", bg: "bg-destructive/10" };
}

export function GreptileScoreBadge({
	score,
	reviewing,
	className,
}: GreptileScoreBadgeProps) {
	if (!reviewing && score === null) return null;

	const iconClass = "w-3 h-3";

	if (reviewing) {
		return (
			<div
				className={cn(
					"flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] leading-none shrink-0",
					"bg-muted",
					className,
				)}
			>
				<LuLoader
					className={cn(iconClass, "text-muted-foreground animate-spin")}
					strokeWidth={STROKE_WIDTH}
				/>
			</div>
		);
	}

	const colors = getScoreColor(score as number);

	return (
		<div
			className={cn(
				"flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] leading-none shrink-0",
				colors.bg,
				className,
			)}
		>
			<LuShieldCheck
				className={cn(iconClass, colors.text)}
				strokeWidth={STROKE_WIDTH}
			/>
			<span className={cn("font-mono tabular-nums leading-none", colors.text)}>
				{score}
			</span>
		</div>
	);
}
