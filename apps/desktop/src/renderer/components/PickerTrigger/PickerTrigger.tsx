import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import type * as React from "react";
import { HiChevronUpDown } from "react-icons/hi2";

type PickerTriggerProps = Omit<
	React.ComponentProps<typeof Button>,
	"children"
> & {
	icon?: React.ReactNode;
	label: React.ReactNode;
	/** Rendered after the label and before the chevron (e.g. status dot). */
	endAdornment?: React.ReactNode;
};

export function PickerTrigger({
	icon,
	label,
	endAdornment,
	className,
	variant = "ghost",
	...props
}: PickerTriggerProps) {
	return (
		<Button
			variant={variant}
			{...props}
			className={cn("justify-between gap-1 px-2 text-xs", className)}
		>
			<span className="flex min-w-0 flex-1 items-center gap-1.5">
				{icon}
				<span className="truncate text-left">{label}</span>
				{endAdornment}
			</span>
			<HiChevronUpDown className="size-3 shrink-0" />
		</Button>
	);
}
