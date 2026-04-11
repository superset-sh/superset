"use client";

import { FileIcon } from "lucide-react";
import type { BundledLanguage } from "shiki";
import { ClickableFilePath } from "./clickable-file-path";
import { CodeBlock } from "./code-block";
import { ToolCallRow } from "./tool-call-row";

export type ReadFileToolProps = {
	/** Basename shown in the header (e.g. "ReadOnlyToolCall.tsx"). */
	filename: string;
	/** Parsed, clean file content (no line-number prefixes). */
	content: string;
	/** Line range label shown in the header (e.g. "1–217"). */
	lineRange?: string;
	/** Shiki language for syntax highlighting. Defaults to "text". */
	language?: BundledLanguage;
	isError?: boolean;
	isPending?: boolean;
	/** When provided, makes the filename clickable to open in pane. */
	onOpenInPane?: () => void;
	className?: string;
};

/**
 * Shared read-file tool call display used by both the main agent's
 * ReadOnlyToolCall and the subagent's SubagentInnerToolCall.
 */
export function ReadFileTool({
	filename,
	content,
	lineRange,
	language = "text" as BundledLanguage,
	isError = false,
	isPending = false,
	onOpenInPane,
	className,
}: ReadFileToolProps) {
	return (
		<ToolCallRow
			className={className}
			description={
				<ClickableFilePath path={filename} onOpen={onOpenInPane} />
			}
			icon={FileIcon}
			isError={isError}
			isPending={isPending}
			title="Read"
		>
			<div className="py-1.5 pl-2">
				<div className="overflow-hidden rounded-md border border-border">
					<div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 font-mono text-xs">
						<ClickableFilePath
							path={filename}
							onOpen={onOpenInPane}
							className="text-foreground"
						/>
						{lineRange && (
							<span className="text-muted-foreground">{lineRange}</span>
						)}
					</div>
					<CodeBlock
						className="rounded-none border-0 [&>div>div]:max-h-[300px] [&_pre]:!p-2"
						code={content}
						colorize={false}
						language={language}
						showLineNumbers
					/>
				</div>
			</div>
		</ToolCallRow>
	);
}
