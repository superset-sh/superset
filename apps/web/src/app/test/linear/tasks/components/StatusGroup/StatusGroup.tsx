"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

interface StatusGroupProps {
	status: string;
	statusColor: string | null;
	count: number;
	children: React.ReactNode;
	defaultOpen?: boolean;
}

export function StatusGroup({
	status,
	statusColor,
	count,
	children,
	defaultOpen = true,
}: StatusGroupProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger className="hover:bg-muted/50 flex h-8 w-full items-center gap-2 px-3 text-sm transition-colors">
				<ChevronRight
					className={cn(
						"text-muted-foreground size-4 transition-transform",
						isOpen && "rotate-90",
					)}
				/>
				<div
					className="size-3 rounded-full"
					style={{ backgroundColor: statusColor ?? "#888" }}
				/>
				<span className="font-medium">{status}</span>
				<span className="text-muted-foreground text-xs">{count}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>{children}</CollapsibleContent>
		</Collapsible>
	);
}
