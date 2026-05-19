import { mermaid } from "@streamdown/mermaid";
import { Button } from "@superset/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@superset/ui/dialog";
import { Maximize2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "renderer/stores";
import { Streamdown } from "streamdown";

const mermaidPlugins = { mermaid };

const MERMAID_DARK_VARS = {
	background: "#1e1e2e",
	primaryColor: "#313244",
	primaryTextColor: "#cdd6f4",
	primaryBorderColor: "#45475a",
	secondaryColor: "#313244",
	secondaryTextColor: "#cdd6f4",
	secondaryBorderColor: "#45475a",
	tertiaryColor: "#313244",
	tertiaryTextColor: "#cdd6f4",
	tertiaryBorderColor: "#45475a",
	nodeBorder: "#45475a",
	nodeTextColor: "#cdd6f4",
	mainBkg: "#313244",
	clusterBkg: "#1e1e2e",
	titleColor: "#cdd6f4",
	edgeLabelBackground: "transparent",
	lineColor: "#6c7086",
	textColor: "#cdd6f4",
};

const MERMAID_LIGHT_VARS = {
	background: "#ffffff",
	primaryColor: "#f0f0f4",
	primaryTextColor: "#1e1e2e",
	primaryBorderColor: "#d0d0d8",
	lineColor: "#888",
	textColor: "#1e1e2e",
};

interface CommentCodeBlockProps {
	className?: string;
	children?: ReactNode;
}

/**
 * Lightweight code renderer for PR comments. Skips ShowCode's
 * line-number/copy chrome — too heavy for short inline review snippets.
 */
export function CommentCodeBlock({
	className,
	children,
}: CommentCodeBlockProps) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";
	const [isExpanded, setIsExpanded] = useState(false);

	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	if (language === "mermaid") {
		const diagram = (
			<Streamdown
				mode="static"
				plugins={mermaidPlugins}
				mermaid={{
					config: {
						theme: "base",
						themeVariables: isDark ? MERMAID_DARK_VARS : MERMAID_LIGHT_VARS,
					},
				}}
			>
				{`\`\`\`mermaid\n${codeString}\n\`\`\``}
			</Streamdown>
		);

		return (
			<>
				<div className="group relative">
					{diagram}
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						onClick={() => setIsExpanded(true)}
						aria-label="Expand diagram"
						className="absolute top-2 right-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
					>
						<Maximize2 className="size-4" />
					</Button>
				</div>
				<Dialog open={isExpanded} onOpenChange={setIsExpanded}>
					<DialogContent className="!max-w-[95vw] !w-[95vw] h-[90vh] overflow-auto p-6">
						<DialogTitle className="sr-only">Diagram preview</DialogTitle>
						<div className="flex h-full w-full items-center justify-center [&_svg]:!max-w-none [&_svg]:!h-auto [&_svg]:!w-full">
							{diagram}
						</div>
					</DialogContent>
				</Dialog>
			</>
		);
	}

	if (!language) {
		return (
			<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
				{children}
			</code>
		);
	}

	return (
		<SyntaxHighlighter
			style={
				(isDark ? oneDark : oneLight) as Record<string, React.CSSProperties>
			}
			language={language}
			PreTag="div"
			className="rounded-md text-sm"
		>
			{codeString}
		</SyntaxHighlighter>
	);
}
