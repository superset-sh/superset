import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { BrainIcon, ChevronRightIcon } from "lucide-react";

interface ReasoningBlockProps {
	reasoning: string;
}

export function ReasoningBlock({ reasoning }: ReasoningBlockProps) {
	return (
		<Collapsible className="not-prose my-2">
			<CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
				<ChevronRightIcon className="size-3 transition-transform group-data-[state=open]:rotate-90" />
				<BrainIcon className="size-3" />
				<span>Thinking</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-1 ml-5 text-xs text-muted-foreground whitespace-pre-wrap border-l border-border/40 pl-3">
				{reasoning}
			</CollapsibleContent>
		</Collapsible>
	);
}
