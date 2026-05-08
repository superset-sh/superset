import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { SafeImage } from "renderer/components/MarkdownRenderer/components";
import { CommentCodeBlock } from "./components/CommentCodeBlock";

type ReactMarkdownComponents = ComponentProps<
	typeof ReactMarkdown
>["components"];

const baseComponents = {
	code: ({
		className,
		children,
	}: {
		className?: string;
		children?: ReactNode;
	}) => <CommentCodeBlock className={className}>{children}</CommentCodeBlock>,
	img: ({ src, alt }: { src?: string; alt?: string }) => (
		<SafeImage src={src} alt={alt} className="comment-md-img" />
	),
	a: ({ href, children }: { href?: string; children?: ReactNode }) => (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="comment-md-link"
		>
			{children}
		</a>
	),
} satisfies ReactMarkdownComponents;

interface CommentMarkdownProps {
	body: string;
	/**
	 * Optional component overrides merged on top of the shared comment
	 * renderer map. Useful for surface-specific affordances like a
	 * copy-button table wrapper.
	 */
	components?: ReactMarkdownComponents;
}

/**
 * Shared markdown renderer for PR comment bodies — used by both the diff
 * pane comment thread bubble and the standalone comment pane so the same
 * comment renders identically across surfaces.
 *
 * Plugin set matches `MarkdownRenderer`: `remarkGfm` for tables/strikethrough/
 * task lists, `rehypeRaw` so review-bot HTML (badges, <details>) parses,
 * `rehypeSanitize` for XSS safety on PR-author-controlled markup.
 *
 * Sizing/spacing is delegated to wrapper-class CSS at each call site (e.g.
 * `.diff-comment-body` vs `.comment-pane-markdown`); the shared map only
 * dictates *what* renders, not how big.
 */
export function CommentMarkdown({ body, components }: CommentMarkdownProps) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[rehypeRaw, rehypeSanitize]}
			components={{ ...baseComponents, ...(components ?? {}) }}
		>
			{body}
		</ReactMarkdown>
	);
}
