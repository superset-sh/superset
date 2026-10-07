import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface DeviceControlButtonProps {
	label: string;
	side?: "top" | "bottom";
	compact?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}

export function DeviceControlButton({
	label,
	side = "bottom",
	compact,
	disabled,
	onClick,
	children,
}: DeviceControlButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size={compact ? "icon-xs" : "icon-sm"}
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground"
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side={side}>{label}</TooltipContent>
		</Tooltip>
	);
}
