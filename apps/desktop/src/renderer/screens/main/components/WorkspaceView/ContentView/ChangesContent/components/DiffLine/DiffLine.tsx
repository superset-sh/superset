import { memo } from "react";
import { useDiffColors } from "renderer/hooks/useDiffColors";
import { useHighlighter } from "renderer/hooks/useHighlighter";
import type { DiffLineProps } from "../../types";

/**
 * Line content with syntax highlighting
 */
function LineContent({
	content,
	language,
}: {
	content: string;
	language: string;
}) {
	const { highlightLine, isReady } = useHighlighter();

	if (!isReady) {
		return <span className="whitespace-pre">{content}</span>;
	}

	const html = highlightLine(content, language);

	return (
		<span
			className="whitespace-pre"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is trusted
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function DiffLineComponent({ line, language, style }: DiffLineProps) {
	const colors = useDiffColors();

	// Determine background and indicator based on line type
	const bgColor =
		line.type === "addition"
			? colors.addedBg
			: line.type === "deletion"
				? colors.deletedBg
				: "transparent";

	const indicatorColor =
		line.type === "addition"
			? colors.addedIndicator
			: line.type === "deletion"
				? colors.deletedIndicator
				: "transparent";

	const indicator =
		line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " ";

	return (
		<div
			className="flex font-mono text-sm leading-6 hover:brightness-110 transition-[filter]"
			style={{ backgroundColor: bgColor, ...style }}
		>
			{/* Old line number */}
			<span
				className="w-12 shrink-0 text-right pr-2 select-none tabular-nums text-xs"
				style={{ color: colors.lineNumber }}
			>
				{line.oldLineNumber ?? ""}
			</span>

			{/* New line number */}
			<span
				className="w-12 shrink-0 text-right pr-2 select-none tabular-nums text-xs"
				style={{ color: colors.lineNumber }}
			>
				{line.newLineNumber ?? ""}
			</span>

			{/* Change indicator (+/-) */}
			<span
				className="w-6 shrink-0 text-center select-none font-bold"
				style={{ color: indicatorColor }}
			>
				{indicator}
			</span>

			{/* Code content with syntax highlighting */}
			<span className="flex-1 px-2 overflow-x-auto">
				<LineContent content={line.content} language={language} />
			</span>
		</div>
	);
}

// Memoize to prevent re-renders during scroll
export const DiffLine = memo(DiffLineComponent);
