"use client";

import { ExternalLinkIcon, FileIcon } from "lucide-react";
import type { BundledLanguage } from "shiki";
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
	/** When provided, renders an "open in pane" icon button in the header. */
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
	const headerExtra = onOpenInPane ? (
		<button
			type="button"
			aria-label={`Open ${filename} in file pane`}
			className="mr-1 flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
			onClick={onOpenInPane}
		>
			<ExternalLinkIcon className="h-3 w-3" />
		</button>
	) : undefined;

	return (
		<ToolCallRow
			className={className}
			description={filename}
			headerExtra={headerExtra}
			icon={FileIcon}
			isError={isError}
			isPending={isPending}
			title="Read"
		>
			<div className="py-1.5 pl-2">
				<div className="overflow-hidden rounded-md border border-border">
					<div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 font-mono text-xs">
						<span className="text-foreground">{filename}</span>
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
