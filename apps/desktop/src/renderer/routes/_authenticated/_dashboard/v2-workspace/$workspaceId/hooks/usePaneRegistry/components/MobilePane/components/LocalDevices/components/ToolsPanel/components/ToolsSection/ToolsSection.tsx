import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";

interface ToolsSectionProps {
	title: ReactNode;
	summary?: ReactNode;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: ReactNode;
}

export function ToolsSection({
	title,
	summary,
	defaultOpen = false,
	onOpenChange,
	children,
}: ToolsSectionProps) {
	return (
		<Collapsible
			defaultOpen={defaultOpen}
			onOpenChange={onOpenChange}
			className="group/section border-t border-border"
		>
			<CollapsibleTrigger className="flex h-8 w-full items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground transition-colors hover:text-foreground">
				<span className="min-w-0 truncate text-left">{title}</span>
				<HiChevronRight className="size-3 shrink-0 transition-transform duration-150 group-data-[state=open]/section:rotate-90" />
				<span className="min-w-0 flex-1" />
				{summary !== undefined && (
					<span className="font-medium tabular-nums normal-case tracking-normal">
						{summary}
					</span>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-2 px-3 pb-3">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
