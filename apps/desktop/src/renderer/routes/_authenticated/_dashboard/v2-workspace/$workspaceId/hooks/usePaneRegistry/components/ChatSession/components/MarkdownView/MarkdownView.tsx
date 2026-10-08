import {
	ChatMarkdown,
	chatMarkdownFirstBlock,
} from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { memo, type ReactNode, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { CHAT_MARKDOWN_COMPONENTS } from "../../constants";
import { pageLinkFinder } from "../../utils/pageLinks";
import { PageLinkCard } from "../PageLinkCard";
import { pageLinksByBlock } from "./utils/pageLinksByBlock";
import { planMarkdown } from "./utils/planMarkdown";

const findPageLinks = pageLinkFinder(env.NEXT_PUBLIC_WEB_URL);

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
			components={CHAT_MARKDOWN_COMPONENTS}
		>
			{block}
		</ChatMarkdown>
	);
});

export function MarkdownView({
	className,
	fading = false,
	final = false,
	pageCards = false,
	pagesShownEarlier = "",
	text,
}: {
	text: string;
	className?: string;
	fading?: boolean;
	/** A page link also shows as a card, under the first settled block that has it. */
	pageCards?: boolean;
	/** The text has stopped growing, so its last block is settled too. */
	final?: boolean;
	/** Space-separated slugs of the pages the turn already shows a card for. */
	pagesShownEarlier?: string;
}) {
	const plan = useMemo(() => planMarkdown(text), [text]);
	const tailKey = `${plan.stable.reduce((sum, entry) => sum + entry.block.length, 0)}`;
	const cards = useMemo(() => {
		if (!pageCards) return [];
		const settled = plan.stable.map((entry) => entry.block);
		if (final && plan.tail !== null) settled.push(plan.tail);
		return pageLinksByBlock(
			settled,
			pagesShownEarlier.split(" ").filter(Boolean),
			findPageLinks,
		);
	}, [pageCards, final, plan, pagesShownEarlier]);

	const blocks: ReactNode[] = [];
	const pushCards = (blockIndex: number) => {
		for (const link of cards[blockIndex] ?? []) {
			blocks.push(
				<PageLinkCard
					className="-mt-2"
					key={`page:${link.slug}`}
					slug={link.slug}
					url={link.url}
				/>,
			);
		}
	};
	plan.stable.forEach((entry, index) => {
		blocks.push(
			<MarkdownBlock block={entry.block} first={index === 0} key={entry.key} />,
		);
		pushCards(index);
	});
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
		pushCards(plan.stable.length);
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
