import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { memo, useMemo } from "react";
import { planMarkdown } from "./utils/planMarkdown";

const MarkdownBlock = memo(function MarkdownBlock({
	block,
}: {
	block: string;
}) {
	return <ChatMarkdown>{block}</ChatMarkdown>;
});

export function MarkdownView({
	className,
	text,
}: {
	text: string;
	className?: string;
}) {
	const plan = useMemo(() => planMarkdown(text), [text]);
	return (
		<div
			className={cn(
				// A measure, not the pane's width: ~110 characters a line is why the
				// same answer reads harder here than in the terminal.
				"flex min-w-0 max-w-[76ch] flex-col gap-1 text-sm",
				className,
			)}
		>
			{plan.stable.map((entry) => (
				<MarkdownBlock block={entry.block} key={entry.key} />
			))}
			{plan.tail !== null &&
				(plan.tailFenceOpen ? (
					<pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs">
						{plan.tail}
					</pre>
				) : (
					<MarkdownBlock block={plan.tail} />
				))}
		</div>
	);
}
