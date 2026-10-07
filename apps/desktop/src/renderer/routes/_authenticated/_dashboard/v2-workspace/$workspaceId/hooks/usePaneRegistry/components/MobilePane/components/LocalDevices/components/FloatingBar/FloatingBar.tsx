import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface FloatingBarProps {
	className?: string;
	children: ReactNode;
}

export function FloatingBar({ className, children }: FloatingBarProps) {
	return (
		<div
			className={cn(
				"absolute z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-md",
				className,
			)}
		>
			{children}
		</div>
	);
}
