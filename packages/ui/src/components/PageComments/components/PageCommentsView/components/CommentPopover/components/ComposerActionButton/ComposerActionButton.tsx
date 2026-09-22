"use client";

import type { ReactNode } from "react";
import { cn } from "../../../../../../../../lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../../../../ui/tooltip";

interface ComposerActionButtonProps {
	label: string;
	active?: boolean;
	expanded?: boolean;
	onClick: () => void;
	children: ReactNode;
}

export function ComposerActionButton({
	label,
	active,
	expanded,
	onClick,
	children,
}: ComposerActionButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-haspopup={expanded === undefined ? undefined : "menu"}
					aria-expanded={expanded}
					onClick={onClick}
					className={cn(
						"flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
						active && "bg-accent text-accent-foreground",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent data-comment-ui="" sideOffset={6}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
