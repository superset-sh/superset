import {
	ChatMarkdown,
	chatMarkdownFirstBlock,
} from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { memo, useMemo } from "react";
import { CHAT_CODE_COMPONENTS } from "../ChatCodeBlock";
import { planMarkdown } from "./utils/planMarkdown";

const MarkdownBlock = memo(function MarkdownBlock({
	block,
	first,
}: {
	block: string;
	first: boolean;
}) {
	return (
		<ChatMarkdown
			className={first ? chatMarkdownFirstBlock : undefined}
			components={CHAT_CODE_COMPONENTS}
		>
			{block}
		</ChatMarkdown>
	);
});

export function MarkdownView({
	className,
	fading = false,
	text,
}: {
	text: string;
	className?: string;
	fading?: boolean;
}) {
	const plan = useMemo(() => planMarkdown(text), [text]);
	const tailKey = `${plan.stable.reduce((sum, entry) => sum + entry.block.length, 0)}`;
	const blocks = plan.stable.map((entry, index) => (
		<MarkdownBlock block={entry.block} first={index === 0} key={entry.key} />
	));
	if (plan.tail !== null) {
		blocks.push(
			plan.tailFenceOpen ? (
				<pre
					className="overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-xs"
					key={`fence:${tailKey}`}
				>
					{plan.tail}
				</pre>
			) : (
				// Keyed like the stable block it becomes, so a finished paragraph keeps its words.
				<MarkdownBlock
					block={plan.tail}
					first={plan.stable.length === 0}
					key={tailKey}
				/>
			),
		);
	}
	return (
		<div
			className={cn(
				"flex min-w-0 flex-col gap-4 font-sans text-sm leading-6 [&>:empty]:hidden",
				fading && "[&>*]:animate-block-fade motion-reduce:[&>*]:animate-none",
				className,
			)}
		>
			{blocks}
		</div>
	);
}
