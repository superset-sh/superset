import { Collapsible, CollapsibleTrigger } from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useId } from "react";
import { VscChevronRight } from "react-icons/vsc";
import { PlainCollapsibleContent } from "../PlainCollapsibleContent";

interface CollapsibleRowProps {
	isExpanded: boolean;
	onToggle: (expanded: boolean) => void;
	header: ReactNode;
	children: ReactNode;
	showChevron?: boolean;
	className?: string;
	triggerClassName?: string;
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
	const contentId = useId();

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn("min-w-0", className)}
		>
			<CollapsibleTrigger
				aria-controls={contentId}
				className={cn(
					"w-full flex items-center gap-1.5 px-1.5 py-1 text-left rounded-sm",
					"hover:bg-accent/50 cursor-pointer transition-colors",
					triggerClassName,
				)}
			>
				{showChevron && (
					<VscChevronRight
						className={cn(
							"size-2.5 text-muted-foreground shrink-0 transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
					/>
				)}
				{header}
			</CollapsibleTrigger>
			<PlainCollapsibleContent
				id={contentId}
				isOpen={isExpanded}
				className={cn("min-w-0", contentClassName)}
			>
				{children}
			</PlainCollapsibleContent>
		</Collapsible>
	);
}
