/**
 * Markdown renderer for chat content. Uses react-markdown + remark-gfm +
 * rehype-sanitize to render safely. Wrapped as a memoized component so
 * stable prefixes in MarkdownStream don't re-render as the tail grows.
 */

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export interface MarkdownProps {
	source: string;
}

export const Markdown = memo(function Markdown({ source }: MarkdownProps) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none break-words">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeSanitize]}
				components={{
					pre: ({ children, ...rest }) => (
						<pre
							data-scrollable="true"
							{...rest}
							className="max-h-[32rem] overflow-auto rounded-md border px-3 py-2 text-[11px]"
						>
							{children}
						</pre>
					),
					code: ({ className, children, ...rest }) => (
						<code {...rest} className={`font-mono text-[0.9em] ${className ?? ""}`}>
							{children}
						</code>
					),
					a: ({ href, children, ...rest }) => (
						<a
							{...rest}
							href={href}
							target="_blank"
							rel="noreferrer noopener"
							className="underline"
						>
							{children}
						</a>
					),
				}}
			>
				{source}
			</ReactMarkdown>
		</div>
	);
});
