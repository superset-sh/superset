import type { ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "renderer/stores";

interface CodeNode {
	position?: {
		start: { line: number; column: number };
		end: { line: number; column: number };
	};
}

interface CodeBlockProps {
	children?: ReactNode;
	className?: string;
	node?: CodeNode;
}

export function CodeBlock({ children, className, node }: CodeBlockProps) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";
	const syntaxStyle = isDark ? oneDark : oneLight;

	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	// Check if this is inline code by looking at the node position
	// In react-markdown, code blocks are wrapped in <pre> which results in multiline content
	// Inline code is typically single-line and has no language class
	const isInline =
		!language && node?.position?.start.line === node?.position?.end.line;

	// Inline code (single backticks)
	if (isInline) {
		return (
			<code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
				{children}
			</code>
		);
	}

	// Code block (with or without language)
	return (
		<SyntaxHighlighter
			style={syntaxStyle as Record<string, React.CSSProperties>}
			language={language ?? "text"}
			PreTag="div"
			className="rounded-md text-sm"
		>
			{codeString}
		</SyntaxHighlighter>
	);
}
