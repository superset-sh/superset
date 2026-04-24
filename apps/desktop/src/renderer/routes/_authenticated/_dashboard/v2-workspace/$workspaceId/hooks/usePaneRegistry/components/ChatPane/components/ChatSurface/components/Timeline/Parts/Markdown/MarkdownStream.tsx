/**
 * Render a streaming markdown buffer by splitting it into a stable
 * prefix block + a live tail block. React memoization keeps the prefix
 * from re-rendering as the tail extends, avoiding visible flicker on
 * long messages.
 */

import { useMemo } from "react";
import { Markdown } from "./Markdown";
import { splitMarkdownStream } from "./MarkdownStream.logic";

export interface MarkdownStreamProps {
	text: string;
	live: boolean;
}

export function MarkdownStream({ text, live }: MarkdownStreamProps) {
	const blocks = useMemo(
		() => splitMarkdownStream(text, live),
		[text, live],
	);
	return (
		<>
			{blocks.map((block, i) => (
				<Markdown
					key={block.mode === "full" ? `stable-${i}` : "live"}
					source={block.raw}
				/>
			))}
		</>
	);
}
