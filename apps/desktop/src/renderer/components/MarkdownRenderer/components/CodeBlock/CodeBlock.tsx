import type { ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
	children?: ReactNode;
	className?: string;
	node?: unknown;
}

export function CodeBlock({ children, className }: CodeBlockProps) {
	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	if (!language) {
		return (
			<code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
				{children}
			</code>
		);
	}

	return (
		<SyntaxHighlighter
			style={oneDark as Record<string, React.CSSProperties>}
			language={language}
			PreTag="div"
			className="rounded-md text-sm"
		>
			{codeString}
		</SyntaxHighlighter>
	);
}
