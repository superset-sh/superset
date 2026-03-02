import { cn } from "@superset/ui/utils";
import { CodeBlock, SafeImage } from "../../components";
import type { MarkdownStyleConfig } from "../types";
import "./default.css";

export const defaultConfig: MarkdownStyleConfig = {
	wrapperClass: "default-markdown",
	articleClass: "px-8 py-6 max-w-none",
	components: {
		code: ({ className, children, node }) => (
			<CodeBlock className={className} node={node}>
				{children}
			</CodeBlock>
		),
		table: ({ children }) => (
			<div className="overflow-x-auto my-4">
				<table className="min-w-full divide-y divide-border">{children}</table>
			</div>
		),
		th: ({ children }) => (
			<th className="px-4 py-2 text-left text-sm font-semibold bg-muted">
				{children}
			</th>
		),
		td: ({ children }) => (
			<td className="px-4 py-2 text-sm border-t border-border">{children}</td>
		),
		blockquote: ({ children }) => (
			<blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-4">
				{children}
			</blockquote>
		),
		a: ({ href, children }) => (
			<a
				href={href}
				className="text-primary underline underline-offset-2 hover:text-primary/80"
				target="_blank"
				rel="noopener noreferrer"
			>
				{children}
			</a>
		),
		img: ({ src, alt }) => (
			<SafeImage
				src={src}
				alt={alt}
				className="max-w-full h-auto rounded-md my-4"
			/>
		),
		hr: () => <hr className="my-8 border-border" />,
		li: ({ children, className }) => {
			const isTaskItem = className?.includes("task-list-item");
			return (
				<li className={cn(isTaskItem && "list-none flex items-start gap-2")}>
					{children}
				</li>
			);
		},
	},
};
