import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";

interface CategorySectionProps {
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	children: ReactNode;
	actions?: ReactNode;
}

export function CategorySection({
	title,
	count,
	isExpanded,
	onToggle,
	children,
	actions,
}: CategorySectionProps) {
	if (count === 0) {
		return null;
	}

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className="border-b-2 border-border last:border-b-0 min-w-0 overflow-hidden"
		>
			{/* Section header */}
			<div className="flex items-center min-w-0">
				<CollapsibleTrigger
					className={cn(
						"flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0",
						"hover:bg-accent/30 cursor-pointer transition-colors",
					)}
				>
					{isExpanded ? (
						<HiChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
					) : (
						<HiChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
					)}
					<span className="text-sm font-medium">{title}</span>
					<span className="text-xs text-muted-foreground shrink-0">
						({count})
					</span>
				</CollapsibleTrigger>
				{actions && <div className="pr-2 shrink-0">{actions}</div>}
			</div>

			{/* Section content */}
			<CollapsibleContent className="px-1 pb-2 min-w-0 overflow-hidden">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
