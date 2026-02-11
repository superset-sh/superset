"use client";

import { cn } from "../../lib/utils";

type ToolInterruptedProps = {
	toolName: string;
	subtitle?: string;
	className?: string;
};

export const ToolInterrupted = ({
	toolName,
	subtitle,
	className,
}: ToolInterruptedProps) => (
	<div className={cn("flex items-center gap-1.5 rounded-md py-0.5", className)}>
		<span className="text-xs text-muted-foreground">
			{toolName} interrupted
		</span>
		{subtitle && (
			<span className="truncate text-xs text-muted-foreground/60">
				{subtitle}
			</span>
		)}
	</div>
);
