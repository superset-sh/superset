import type { ToolContent } from "@superset/chat/protocol";
import { CodeBlock } from "@superset/ui/ai-elements/code-block";

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

function toUnified(content: DiffToolContent): string {
	const oldLines =
		content.oldText === null
			? []
			: content.oldText.split("\n").map((line) => `-${line}`);
	const newLines = content.newText.split("\n").map((line) => `+${line}`);
	return [
		`--- a/${content.path}`,
		`+++ b/${content.path}`,
		...oldLines,
		...newLines,
	].join("\n");
}

export function DiffContent({ content }: { content: DiffToolContent }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="font-mono text-xs text-muted-foreground">
				{content.path}
				{content.oldText === null ? " (new file)" : ""}
			</span>
			<CodeBlock code={toUnified(content)} language="diff" />
		</div>
	);
}
