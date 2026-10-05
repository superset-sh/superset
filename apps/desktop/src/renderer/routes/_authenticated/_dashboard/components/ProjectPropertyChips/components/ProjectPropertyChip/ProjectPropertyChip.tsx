import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";

interface ProjectPropertyChipProps extends ComponentProps<"button"> {
	isSet: boolean;
}

export function ProjectPropertyChip({
	isSet,
	className,
	...props
}: ProjectPropertyChipProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-7 items-center gap-1.5 rounded-md border border-border/60 px-2 text-xs transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				isSet ? "text-foreground" : "text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
