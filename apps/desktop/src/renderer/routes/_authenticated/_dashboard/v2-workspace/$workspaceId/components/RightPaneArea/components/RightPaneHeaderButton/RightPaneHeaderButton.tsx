import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface RightPaneHeaderButtonProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

export function RightPaneHeaderButton({
	label,
	onClick,
	children,
}: RightPaneHeaderButtonProps) {
	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onClick={onClick}
					className="no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
