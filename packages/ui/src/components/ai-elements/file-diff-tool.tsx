"use client";

import { ChevronDownIcon, ExternalLinkIcon, FileCode2Icon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ShimmerLabel } from "./shimmer-label";

type FileDiffToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type DiffLine = { type: "added" | "removed" | "context"; content: string };

export interface FileDiffToolExpandedContentProps {
	filePath?: string;
	oldString?: string;
	newString?: string;
	content?: string;
	isWriteMode?: boolean;
}

type FileDiffToolProps = {
	filePath?: string;
	oldString?: string;
	newString?: string;
	content?: string;
	isWriteMode?: boolean;
	state: FileDiffToolState;
	structuredPatch?: Array<{ lines: string[] }>;
	onFilePathClick?: (filePath: string) => void;
	onDiffPathClick?: (filePath: string) => void;
	renderExpandedContent?: (
		props: FileDiffToolExpandedContentProps,
	) => ReactNode;
	className?: string;
};

/** Extract the filename from a full path. */
function extractFilename(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

/** Parse structured patch hunks into typed diff lines. */
function getDiffLines(hunks: Array<{ lines: string[] }>): DiffLine[] {
	const result: DiffLine[] = [];
	for (const hunk of hunks) {
		for (const line of hunk.lines) {
			if (line.startsWith("+")) {
				result.push({ type: "added", content: line.slice(1) });
			} else if (line.startsWith("-")) {
				result.push({ type: "removed", content: line.slice(1) });
			} else {
				// Context line (starts with space or is unchanged)
				result.push({
					type: "context",
					content: line.startsWith(" ") ? line.slice(1) : line,
				});
			}
		}
	}
	return result;
}

/** Build diff lines from old/new strings using a simple line-based comparison. */
function buildSimpleDiff({
	oldString,
	newString,
}: {
	oldString: string;
	newString: string;
}): DiffLine[] {
	const oldLines = oldString.split("\n");
	const newLines = newString.split("\n");
	const result: DiffLine[] = [];

	for (const line of oldLines) {
		result.push({ type: "removed", content: line });
	}
	for (const line of newLines) {
		result.push({ type: "added", content: line });
	}
	return result;
}

/** Count additions and removals from diff lines. */
function calculateDiffStats(lines: DiffLine[]): {
	additions: number;
	removals: number;
} {
	let additions = 0;
	let removals = 0;
	for (const line of lines) {
		if (line.type === "added") additions++;
		else if (line.type === "removed") removals++;
	}
	return { additions, removals };
}

const EXPANDED_MAX_HEIGHT = 200;

export const FileDiffTool = ({
	filePath,
	oldString,
	newString,
	content,
	isWriteMode,
	state,
	structuredPatch,
	onFilePathClick,
	onDiffPathClick,
	renderExpandedContent,
	className,
}: FileDiffToolProps) => {
	const hasExpandedRenderer = Boolean(renderExpandedContent);
	const [expanded, setExpanded] = useState(hasExpandedRenderer);
	const [hasAutoExpanded, setHasAutoExpanded] = useState(false);

	useEffect(() => {
		if (!hasAutoExpanded && hasExpandedRenderer) {
			setExpanded(true);
			setHasAutoExpanded(true);
		}
	}, [hasAutoExpanded, hasExpandedRenderer]);

	const isStreaming = state === "input-streaming";

	const diffLines = useMemo(() => {
		// Use structured patch if available
		if (structuredPatch?.length) {
			return getDiffLines(structuredPatch);
		}
		// Write mode: all lines are additions
		if (isWriteMode && content) {
			return content
				.split("\n")
				.map((line): DiffLine => ({ type: "added", content: line }));
		}
		// Edit mode: build diff from old/new
		if (oldString !== undefined && newString !== undefined) {
			return buildSimpleDiff({ oldString, newString });
		}
		return [];
	}, [structuredPatch, isWriteMode, content, oldString, newString]);

	const stats = useMemo(() => calculateDiffStats(diffLines), [diffLines]);
	const hasDiff = diffLines.length > 0;
	const canOpenFile = Boolean(filePath && onFilePathClick);
	const canOpenDiffPane = Boolean(filePath && onDiffPathClick);
	const hasOpenMenu = canOpenFile && canOpenDiffPane;
	const expandedContentProps = useMemo(
		() => ({
			filePath,
			oldString,
			newString,
			content,
			isWriteMode,
		}),
		[filePath, oldString, newString, content, isWriteMode],
	);

	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-muted/30",
				className,
			)}
		>
			{/* Header - fixed height */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: interactive tool header */}
			<div
				className={cn(
					"flex h-7 items-center justify-between px-2.5",
					hasDiff &&
						"cursor-pointer transition-colors duration-150 hover:bg-muted/50",
				)}
				onClick={() => hasDiff && setExpanded((prev) => !prev)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
					<FileCode2Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
					{isStreaming && !filePath ? (
						<ShimmerLabel className="text-xs text-muted-foreground">
							{isWriteMode ? "Writing file..." : "Editing file..."}
						</ShimmerLabel>
					) : (
						<span className="min-w-0 truncate text-muted-foreground">
							{isWriteMode ? "Wrote" : "Edited"}{" "}
							{canOpenFile && filePath ? (
								<button
									type="button"
									className="inline cursor-pointer truncate text-foreground transition-colors hover:text-muted-foreground"
									onClick={(event) => {
										event.stopPropagation();
										onFilePathClick?.(filePath);
									}}
								>
									{extractFilename(filePath)}
								</button>
							) : (
								<span className="text-foreground">
									{filePath ? extractFilename(filePath) : "file"}
								</span>
							)}
						</span>
					)}
				</div>

				<div className="ml-2 flex shrink-0 items-center gap-1.5 text-xs">
					{hasOpenMenu && filePath ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label={`Open ${filePath}`}
									className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									onClick={(event) => {
										event.stopPropagation();
									}}
								>
									<ExternalLinkIcon className="h-3 w-3" />
									Open
									<ChevronDownIcon className="h-3 w-3" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								onClick={(event) => {
									event.stopPropagation();
								}}
							>
								<DropdownMenuItem onClick={() => onFilePathClick?.(filePath)}>
									Open in File pane
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onDiffPathClick?.(filePath)}>
									Open in Changes pane
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						canOpenFile &&
						filePath && (
							<button
								type="button"
								aria-label={`Open ${filePath}`}
								className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onClick={(event) => {
									event.stopPropagation();
									onFilePathClick?.(filePath);
								}}
							>
								<ExternalLinkIcon className="h-3 w-3" />
								Open
							</button>
						)
					)}

					{/* Diff stats */}
					{(stats.additions > 0 || stats.removals > 0) && (
						<span className="flex items-center gap-1.5">
							{stats.additions > 0 && (
								<span className="text-green-500">+{stats.additions}</span>
							)}
							{stats.removals > 0 && (
								<span className="text-red-500">-{stats.removals}</span>
							)}
						</span>
					)}
				</div>
			</div>

			{/* Diff body */}
			{hasDiff && expanded && (
				<div
					className="overflow-y-auto border-t border-border"
					style={{ maxHeight: EXPANDED_MAX_HEIGHT }}
				>
					{renderExpandedContent ? (
						renderExpandedContent(expandedContentProps)
					) : (
						<div className="font-mono text-xs">
							{diffLines.map((line, i) => (
								<div
									className={cn(
										"flex border-l-2 px-2.5 py-0.5",
										line.type === "added" &&
											"border-l-green-500 bg-green-500/10 text-green-700 dark:text-green-400",
										line.type === "removed" &&
											"border-l-red-500 bg-red-500/10 text-red-700 dark:text-red-400",
										line.type === "context" &&
											"border-l-transparent text-muted-foreground",
									)}
									key={`${i}-${line.type}`}
								>
									<span className="mr-2 select-none">
										{line.type === "added"
											? "+"
											: line.type === "removed"
												? "-"
												: " "}
									</span>
									<pre className="whitespace-pre-wrap break-all">
										{line.content}
									</pre>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Streaming indicator */}
			{isStreaming && !hasDiff && (
				<div className="border-t border-border px-2.5 py-1.5">
					<span className="animate-pulse font-mono text-muted-foreground/50 text-xs">
						...
					</span>
				</div>
			)}
		</div>
	);
};
