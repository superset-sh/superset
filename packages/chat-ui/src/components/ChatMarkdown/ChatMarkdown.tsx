import { cn } from "@superset/ui/utils";
import type { FunctionComponent, JSX, ReactNode } from "react";
import { createElement, memo } from "react";
import type { Components, ExtraProps } from "streamdown";
import { Streamdown } from "streamdown";

/**
 * Streamdown's `Components` is an intersection — per-tag props on one side, an
 * index signature on the other — so a renderer has to accept what either side
 * may pass. Only `className` is read; everything else is handed straight back
 * to the tag. `node` is the markdown AST node, which belongs to the renderer
 * rather than to the DOM.
 */
type MarkdownRenderer = FunctionComponent<ExtraProps & { className?: unknown }>;

function styled(
	tag: keyof JSX.IntrinsicElements,
	classes: string,
): MarkdownRenderer {
	return function StyledMarkdownElement({ node: _node, className, ...rest }) {
		return createElement(tag, {
			...rest,
			className: cn(classes, typeof className === "string" ? className : null),
		});
	};
}

/**
 * How a chat renders agent markdown.
 *
 * Streamdown bakes its classes into each default renderer — inline code is a
 * padded, filled box; h1 is display-sized — and chasing those with descendant
 * selectors from outside means every surface grows its own skin and they drift
 * apart. These replace the renderers, so there is one answer to import.
 *
 * The answer follows the CLI, which agent prose was written for: code marked
 * by typeface rather than by chrome, and headings carrying weight rather than
 * size, because a heading inside a paragraph of chat is an aside and not a
 * banner. The palette has no hue to spare either way — `--primary` is chroma 0
 * in both themes.
 */
export const chatMarkdownComponents = {
	// Inline code only. Fenced blocks keep Streamdown's own block treatment.
	inlineCode: styled(
		"code",
		"rounded-[3px] bg-foreground/[0.06] px-1 py-0 font-normal text-[0.92em]",
	),
	h1: styled("h1", "mt-4 mb-1 font-semibold text-[1.05em]"),
	h2: styled("h2", "mt-4 mb-1 font-semibold text-[1em]"),
	h3: styled("h3", "mt-3 mb-1 font-semibold text-[1em]"),
	// Markers outside, so a wrapped line hangs under its text rather than
	// running back under the bullet.
	ul: styled("ul", "my-1 list-outside pl-5"),
	ol: styled("ol", "my-1 list-outside pl-5"),
	li: styled("li", "my-0.5 pl-1 leading-relaxed"),
	p: styled("p", "leading-relaxed"),
	// Tables read as data, not as cards.
	th: styled("th", "px-2 py-1 text-xs"),
	td: styled("td", "px-2 py-1"),
} satisfies Components;

export type ChatMarkdownProps = {
	children: string;
	className?: string;
};

/** One block of agent markdown, rendered the way every chat surface does. */
export const ChatMarkdown = memo(function ChatMarkdown({
	children,
	className,
}: ChatMarkdownProps): ReactNode {
	return (
		<Streamdown
			className={cn("[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
			components={chatMarkdownComponents}
			linkSafety={{ enabled: false }}
			mode="streaming"
		>
			{children}
		</Streamdown>
	);
});
