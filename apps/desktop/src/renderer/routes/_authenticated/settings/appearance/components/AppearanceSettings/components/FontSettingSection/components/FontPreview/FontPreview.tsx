import type { CSSProperties } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "renderer/stores";
import { FontNotFoundBanner } from "./components/FontNotFoundBanner";

const CODE_PREVIEW = `import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const webSearchTool = createTool({
  id: "web_search",
  description: "Search the web for current information.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    maxResults: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(5),
  }),
  execute: async ({ context }) => {
    const results = await search(context.query);
    return { results: results.slice(0, context.maxResults) };
  },
});`;

const TERMINAL_PREVIEW = `\u256D\u2500 mastra agent \u2500\u2500 feat/add-tool \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E
\u2502 \u2713 Created inputSchema with zod            \u2502
\u2502 \u2713 Wired execute handler                   \u2502
\u2502 \u2BFF Running tool integration tests...        \u2502
\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F
\u256D\u2500 mastra agent \u2500\u2500 fix/workspace-sandbox \u2500\u2500\u256E
\u2502 \u2713 Patched LocalSandbox timeout             \u2502
\u2502 \u2713 Updated workspace config                 \u2502
\u2502 \u2713 All 5 tests passing                      \u2502
\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F
\u256D\u2500 mastra agent \u2500\u2500 chore/mcp-server \u2500\u2500\u2500\u2500\u2500\u2500\u256E
\u2502 \u2BFF Registering tools with MCP server...     \u2502
\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F

 3 agents running \u00B7 2 workspaces \u00B7 8 files changed

 Friends don't let friends compact.`;

export function FontPreview({
	fontFamily,
	fontSize,
	variant,
	isCustomFont,
}: {
	fontFamily: string;
	fontSize: number;
	variant: "editor" | "terminal";
	isCustomFont: boolean;
}) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";
	const isTerminal = variant === "terminal";
	const fontFamilyStyle = fontFamily || undefined;

	return (
		<div
			className={`rounded-md border overflow-hidden ${
				isTerminal ? "bg-[#1e1e1e] text-[#cccccc] border-[#333]" : "bg-muted/50"
			}`}
		>
			{isTerminal ? (
				<div
					className="p-3"
					style={{
						fontFamily: fontFamilyStyle,
						fontSize: `${fontSize}px`,
						lineHeight: 1.5,
						whiteSpace: "pre-wrap",
					}}
				>
					{TERMINAL_PREVIEW}
				</div>
			) : (
				<SyntaxHighlighter
					language="typescript"
					style={(isDark ? oneDark : oneLight) as Record<string, CSSProperties>}
					customStyle={{
						margin: 0,
						padding: "12px",
						fontSize: `${fontSize}px`,
						lineHeight: 1.5,
						fontFamily: fontFamilyStyle,
						background: "transparent",
					}}
					codeTagProps={{
						style: {
							fontFamily: fontFamilyStyle,
						},
					}}
				>
					{CODE_PREVIEW}
				</SyntaxHighlighter>
			)}
			{isCustomFont && <FontNotFoundBanner fontFamily={fontFamily} />}
		</div>
	);
}
