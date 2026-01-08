import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";

interface CollapsibleRowProps {
	/** Whether the row is expanded */
	isExpanded: boolean;
	/** Called when the row is toggled */
	onToggle: (expanded: boolean) => void;
	/** The content to render in the trigger/header area */
	header: ReactNode;
	/** The content to render when expanded */
	children: ReactNode;
	/** Whether to show the chevron icon */
	showChevron?: boolean;
	/** Additional classes for the container */
	className?: string;
	/** Additional classes for the trigger */
	triggerClassName?: string;
	/** Additional classes for the content */
	contentClassName?: string;
}

export function CollapsibleRow({
	isExpanded,
	onToggle,
	header,
	children,
	showChevron = true,
	className,
	triggerClassName,
	contentClassName,
}: CollapsibleRowProps) {
	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn("min-w-0", className)}
		>
			<CollapsibleTrigger
				className={cn(
					"w-full flex items-center gap-1.5 px-1.5 py-1 text-left rounded-sm",
					"hover:bg-accent/50 cursor-pointer transition-colors",
					triggerClassName,
				)}
			>
				{showChevron && (
					<HiChevronRight
						className={cn(
							"size-2.5 text-muted-foreground shrink-0 transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
					/>
				)}
				{header}
			</CollapsibleTrigger>
			<CollapsibleContent className={cn("min-w-0", contentClassName)}>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
