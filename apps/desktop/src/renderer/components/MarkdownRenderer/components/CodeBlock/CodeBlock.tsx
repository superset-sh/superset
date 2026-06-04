import { mermaid } from "@streamdown/mermaid";
import { ShowCode } from "@superset/ui/ai-elements/show-code";
import type { ReactNode } from "react";
import { useTheme } from "renderer/stores";
import { Streamdown } from "streamdown";

const mermaidPlugins = { mermaid };

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

	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	const isInline =
		!language && node?.position?.start.line === node?.position?.end.line;

	if (isInline) {
		return (
			<code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
				{children}
			</code>
		);
	}

	if (language === "mermaid") {
		return (
			<Streamdown
				mode="static"
				plugins={mermaidPlugins}
				mermaid={{ config: { theme: isDark ? "dark" : "default" } }}
			>
				{`\`\`\`mermaid\n${codeString}\n\`\`\``}
			</Streamdown>
		);
	}

	return (
		<ShowCode
			className="my-4"
			// biome-ignore lint/suspicious/noExplicitAny: ShowCode accepts BundledLanguage; language is an untyped string here
			language={language as any}
			code={codeString}
			showLineNumbers
		/>
	);
}
