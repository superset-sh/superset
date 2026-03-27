import { cn } from "@superset/ui/lib/utils";

interface PaneSplitHandleProps {
	orientation: "horizontal" | "vertical";
	onDoubleClick: () => void;
}

export function PaneSplitHandle({
	orientation,
	onDoubleClick,
}: PaneSplitHandleProps) {
	const isHorizontal = orientation === "horizontal";

	return (
		<button
			aria-label="Equalize split"
			className={cn(
				"group bg-border focus-visible:ring-ring relative flex shrink-0 items-center justify-center transition-colors hover:bg-border/90 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden",
				isHorizontal
					? "h-full w-px cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2"
					: "h-px w-full cursor-row-resize after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2",
			)}
			onDoubleClick={onDoubleClick}
			type="button"
		>
			<span
				className={cn(
					"bg-border/80 rounded-full opacity-0 transition-opacity group-hover:opacity-100",
					isHorizontal ? "h-10 w-[3px]" : "h-[3px] w-10",
				)}
			/>
		</button>
	);
}
