import { cn } from "@superset/ui/utils";
import type { ComponentProps, FunctionComponent, JSX, ReactNode } from "react";
import { createElement, memo, useMemo } from "react";
import type { Components, ExtraProps, StreamdownProps } from "streamdown";
import { defaultRemarkPlugins, Streamdown } from "streamdown";

/**
 * Streamdown's `Components` is an intersection — per-tag props on one side, an
 * index signature on the other — so a renderer has to accept what either side
 * may pass. Only `className` is read; everything else is handed straight back
 * to the tag. `node` is the markdown AST node, which belongs to the renderer
 * rather than to the DOM.
 */
type RendererProps = ExtraProps & { className?: unknown; children?: ReactNode };
type MarkdownRenderer = FunctionComponent<RendererProps>;

function ownClassName(className: unknown): string | null {
	return typeof className === "string" ? className : null;
}

function styled(
	tag: keyof JSX.IntrinsicElements,
	classes: string,
): MarkdownRenderer {
	return function StyledMarkdownElement({ node: _node, className, ...rest }) {
		return createElement(tag, {
			...rest,
			className: cn(classes, ownClassName(className)),
		});
	};
}

function Link({
	node: _node,
	className,
	children,
	...rest
}: RendererProps & ComponentProps<"a">) {
	return (
		<a
			rel="noreferrer"
			target="_blank"
			{...rest}
			className={cn(
				"underline underline-offset-2 wrap-anywhere",
				ownClassName(className),
			)}
		>
			{children}
		</a>
	);
}

function Table({ node: _node, className, children, ...rest }: RendererProps) {
	return (
		<div className="mb-2 max-w-full overflow-x-auto">
			<table
				{...rest}
				className={cn("border border-border", ownClassName(className))}
			>
				{children}
			</table>
		</div>
	);
}

function Rule() {
	return (
		<div className="py-2">
			<hr className="border-border" />
		</div>
	);
}

/**
 * How a chat renders agent markdown: a document's measured spacing in a
 * narrow column. Streamdown zeroes the first child's top margin and the last
 * child's bottom margin inside every root it renders, and a streamed message
 * is one root per block, so the space above an element is the surface's gap
 * and the extra room a heading or a rule asks for is padding, which that
 * reset leaves alone.
 */
export const chatMarkdownComponents = {
	p: styled("p", "mb-2 last:mb-0"),
	h1: styled("h1", "mb-2 pt-2 font-semibold text-lg"),
	h2: styled("h2", "mb-2 pt-2 font-semibold text-base"),
	h3: styled("h3", "mb-2 pt-1 font-semibold"),
	h4: styled("h4", "mb-1 pt-1 font-medium"),
	h5: styled("h5", "mb-1 font-semibold text-muted-foreground uppercase"),
	h6: styled(
		"h6",
		"mb-1 font-semibold text-muted-foreground text-xs uppercase",
	),
	ul: styled("ul", "mb-2 list-disc pl-5"),
	ol: styled("ol", "mb-2 list-decimal pl-5"),
	// A task item wears its checkbox where the marker would be.
	li: styled(
		"li",
		"mb-1 [&.task-list-item]:list-none [&.task-list-item_input]:-ml-5 [&.task-list-item_input]:mr-[7px] [&.task-list-item_input]:accent-foreground",
	),
	a: Link,
	inlineCode: styled(
		"code",
		"rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs",
	),
	blockquote: styled(
		"blockquote",
		"mb-2 border-border border-l-2 pl-3 text-muted-foreground",
	),
	table: Table,
	thead: styled("thead", "bg-foreground/[0.04]"),
	th: styled("th", "border border-border px-2 py-1 text-left font-medium"),
	td: styled("td", "border border-border px-2 py-1"),
	hr: Rule,
} satisfies Components;

/** For the root that opens a message: nothing above it to make room for. */
export const chatMarkdownFirstBlock = "[&>:first-child]:pt-0";

export type ChatMarkdownProps = {
	children: string;
	className?: string;
	/** Renderers a surface adds on top of the shared skin, such as its own code block. */
	components?: Components;
	/** Remark plugins a surface runs after Streamdown's own. */
	remarkPlugins?: NonNullable<StreamdownProps["remarkPlugins"]>;
};

/** One block of agent markdown, rendered the way every chat surface does. */
export const ChatMarkdown = memo(function ChatMarkdown({
	children,
	className,
	components,
	remarkPlugins,
}: ChatMarkdownProps): ReactNode {
	const merged = useMemo(
		() =>
			components
				? { ...chatMarkdownComponents, ...components }
				: chatMarkdownComponents,
		[components],
	);
	const mergedRemarkPlugins = useMemo(
		() =>
			remarkPlugins
				? [...Object.values(defaultRemarkPlugins), ...remarkPlugins]
				: undefined,
		[remarkPlugins],
	);
	return (
		// The elements carry their own bottom margins, so Streamdown's
		// `space-y-4` between root children goes.
		<Streamdown
			className={cn("space-y-0 break-words", className)}
			components={merged}
			linkSafety={{ enabled: false }}
			mode="streaming"
			remarkPlugins={mergedRemarkPlugins}
		>
			{children}
		</Streamdown>
	);
});
