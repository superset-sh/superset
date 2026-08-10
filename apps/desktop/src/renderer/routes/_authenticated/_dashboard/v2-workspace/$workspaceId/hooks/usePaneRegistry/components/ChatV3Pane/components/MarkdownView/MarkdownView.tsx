import { cn } from "@superset/ui/utils";
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { planMarkdown } from "./utils/planMarkdown";

const MarkdownBlock = memo(function MarkdownBlock({
	block,
}: {
	block: string;
}) {
	return (
		<Streamdown
			className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
			linkSafety={{ enabled: false }}
			mode="streaming"
		>
			{block}
		</Streamdown>
	);
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
		<div className={cn("flex min-w-0 flex-col gap-1 text-sm", className)}>
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
