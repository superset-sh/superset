import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";

// Shared trigger for the top-of-modal pickers (Device / Project / Branch).
// No background; uniform icon size, text size, and text color so the three
// pickers read as one segmented control.
export function FormPickerTrigger({
	className,
	type = "button",
	...props
}: ComponentProps<"button">) {
	return (
		<button
			type={type}
			className={cn(
				"inline-flex items-center gap-1 h-[22px] text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0",
				className,
			)}
			{...props}
		/>
	);
}
