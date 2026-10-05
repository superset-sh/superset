import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface ImageToolbarButtonProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

export function ImageToolbarButton({
	label,
	onClick,
	children,
}: ImageToolbarButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClick}
					className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
