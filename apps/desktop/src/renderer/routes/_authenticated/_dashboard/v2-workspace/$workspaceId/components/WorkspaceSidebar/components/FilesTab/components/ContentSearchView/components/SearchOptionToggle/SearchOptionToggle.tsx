import { Toggle } from "@superset/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ComponentType } from "react";

interface SearchOptionToggleProps {
	label: string;
	pressed: boolean;
	onPressedChange: (pressed: boolean) => void;
	icon: ComponentType<{ className?: string }>;
}

export function SearchOptionToggle({
	label,
	pressed,
	onPressedChange,
	icon: Icon,
}: SearchOptionToggleProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Toggle
					size="sm"
					pressed={pressed}
					onPressedChange={onPressedChange}
					aria-label={label}
					className="size-6 min-w-6 p-0 text-muted-foreground data-[state=on]:text-foreground"
				>
					<Icon className="size-3.5" />
				</Toggle>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
