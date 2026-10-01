import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface CloudSectionProps {
	title: ReactNode;
	titleClassName?: string;
	/** Lists past four rows scroll instead of growing the card. */
	scrollable?: boolean;
	children: ReactNode;
}

export function CloudSection({
	title,
	titleClassName,
	scrollable = false,
	children,
}: CloudSectionProps) {
	return (
		<div className="space-y-1">
			<div
				className={cn(
					"px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase",
					titleClassName,
				)}
			>
				{title}
			</div>
			<div className={cn(scrollable && "max-h-28 overflow-y-auto")}>
				{children}
			</div>
		</div>
	);
}
