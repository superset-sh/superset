import type { CSSProperties } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "renderer/stores";
import { FontNotFoundBanner } from "./components/FontNotFoundBanner";

const CODE_PREVIEW = `import { router, publicProcedure } from "../trpc";
import { z } from "zod";

export const agentRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.agents.findMany({
      where: eq(agents.workspaceId, ctx.workspaceId),
      orderBy: [desc(agents.createdAt)],
    });
  }),
  spawn: publicProcedure
    .input(z.object({ task: z.string(), worktree: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const branch = await createWorktree(input.task);
      return startAgent({ ...input, branch });
    }),
});`;

const TERMINAL_PREVIEW = `\u256D\u2500 Agent 1 \u2500\u2500 feat/add-oauth \u2500\u2500\u2500 worktree \u2500\u2500\u256E
\u2502 \u2713 Created OAuth provider schema           \u2502
\u2502 \u2713 Added Google + GitHub strategies        \u2502
\u2502 \u2BFF Writing callback route handler\u2026         \u2502
\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F
\u256D\u2500 Agent 2 \u2500\u2500 fix/terminal-resize \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E
\u2502 \u2713 Identified debounce race condition      \u2502
\u2502 \u2713 Applied fix in Terminal/config.ts       \u2502
\u2502 \u2713 All 3 tests passing                     \u2502
\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F
\u256D\u2500 Agent 3 \u2500\u2500 chore/db-migration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E
\u2502 \u2BFF Generating drizzle migration\u2026           \u2502
\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F

 3 agents running \u00B7 2 worktrees \u00B7 14 files changed`;

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
