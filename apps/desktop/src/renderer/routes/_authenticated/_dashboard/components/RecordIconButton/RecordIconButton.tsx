import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface RecordIconButtonProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

export function RecordIconButton({
	label,
	onClick,
	children,
}: RecordIconButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon-sm"
					variant="outline"
					aria-label={label}
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground"
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
