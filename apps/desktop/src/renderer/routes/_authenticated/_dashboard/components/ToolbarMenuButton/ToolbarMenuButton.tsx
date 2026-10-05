import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";

interface ToolbarMenuButtonProps extends ComponentProps<typeof Button> {
	/** Muted until something is chosen, so a set filter stands out. */
	isActive?: boolean;
}

export function ToolbarMenuButton({
	isActive = false,
	className,
	...props
}: ToolbarMenuButtonProps) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(
				"h-8 gap-1.5 px-2 font-normal",
				!isActive && "text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
