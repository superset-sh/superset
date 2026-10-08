import { useLingui } from "@lingui/react/macro";
import type { Reasoning as ReasoningItem } from "@superset/chat/protocol";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { MarkdownView } from "../../../MarkdownView";
import { thoughtSummary } from "./utils/thoughtSummary";

const THINKING_SWEEP_SECONDS = 1.6;

/**
 * One quiet line: "Thinking..." until the thought has words, then its first
 * paragraph, breathing while it streams. The whole thought opens beneath it
 * on request and stays how the reader left it.
 */
export function ReasoningRow({
	item,
	text,
}: {
	item: ReasoningItem;
	text: string;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const streaming = item.completedAtMs === undefined;
	const summary = useMemo(() => thoughtSummary(text), [text]);

	if (!summary && streaming) {
		return (
			<div className="py-1 font-sans text-sm">
				<Shimmer duration={THINKING_SWEEP_SECONDS} variant="text">
					{t({ message: "Thinking..." })}
				</Shimmer>
			</div>
		);
	}
	if (!text.trim()) return null;

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger className="group flex w-full min-w-0 items-center py-1 text-left font-sans text-sm">
				<span
					className={cn(
						"min-w-0 flex-1 truncate text-foreground/50 transition-colors duration-200 group-hover:text-foreground/75",
						streaming && "animate-thinking-pulse motion-reduce:animate-none",
					)}
				>
					{summary || t({ message: "Thought for a few seconds" })}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="pb-2">
				<MarkdownView
					className="text-foreground/50 [&_em]:text-foreground/60 [&_strong]:text-foreground/60"
					text={text}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}
