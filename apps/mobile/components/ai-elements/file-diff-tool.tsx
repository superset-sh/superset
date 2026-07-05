import {
	ChevronDownIcon,
	ExternalLinkIcon,
	FileCode2Icon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./shimmer-label";
import { ToolCallRow } from "./tool-call-row";

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

const MAX_VISIBLE_LINES = 12;

const DIFF_LINE_TEXT_CLASS: Record<DiffLine["type"], string> = {
	added: "text-green-700 dark:text-green-400",
	removed: "text-red-700 dark:text-red-400",
	context: "text-muted-foreground",
};

const DIFF_LINE_PREFIX: Record<DiffLine["type"], string> = {
	added: "+",
	removed: "-",
	context: " ",
};

const DiffLines = ({ lines }: { lines: DiffLine[] }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const isOverflowing = lines.length > MAX_VISIBLE_LINES;
	const visibleLines =
		isOverflowing && !isExpanded ? lines.slice(0, MAX_VISIBLE_LINES) : lines;

	return (
		<View>
			{visibleLines.map((line, i) => (
				<View
					className={cn(
						"flex-row border-l-2 px-2.5 py-0.5",
						line.type === "added" && "border-l-green-500 bg-green-500/10",
						line.type === "removed" && "border-l-red-500 bg-red-500/10",
						line.type === "context" && "border-l-transparent",
					)}
					key={`${i}-${line.type}`}
				>
					<Text
						className={cn(
							"mr-2 font-mono text-xs",
							DIFF_LINE_TEXT_CLASS[line.type],
						)}
					>
						{DIFF_LINE_PREFIX[line.type]}
					</Text>
					<Text
						className={cn(
							"min-w-0 flex-1 font-mono text-xs",
							DIFF_LINE_TEXT_CLASS[line.type],
						)}
					>
						{line.content}
					</Text>
				</View>
			))}
			{isOverflowing ? (
				<Pressable
					accessibilityRole="button"
					className="px-2.5 py-1"
					hitSlop={8}
					onPress={() => setIsExpanded((prev) => !prev)}
				>
					<Text className="text-muted-foreground text-xs underline">
						{isExpanded
							? "Show less"
							: `Show ${lines.length - MAX_VISIBLE_LINES} more lines`}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
};

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

	// Title node: shimmer while streaming with no path, otherwise "Wrote/Edited filename"
	const titleNode =
		isStreaming && !filePath ? (
			<ShimmerLabel isShimmering shimmerClassName="text-foreground text-xs">
				{isWriteMode ? "Writing file..." : "Editing file..."}
			</ShimmerLabel>
		) : (
			<View className="min-w-0 shrink flex-row items-center gap-1">
				<Text className="shrink-0 font-mono text-foreground text-xs">
					{isWriteMode ? "Wrote" : "Edited"}
				</Text>
				{canOpenFile && filePath ? (
					<Text
						accessibilityRole="button"
						className="min-w-0 shrink font-mono text-foreground text-xs"
						numberOfLines={1}
						onPress={() => onFilePathClick?.(filePath)}
						suppressHighlighting
					>
						{extractFilename(filePath)}
					</Text>
				) : (
					<Text
						className="min-w-0 shrink font-mono text-foreground text-xs"
						numberOfLines={1}
					>
						{filePath ? extractFilename(filePath) : "file"}
					</Text>
				)}
			</View>
		);

	// Status slot: diff stats (+N -N)
	const statusNode =
		stats.additions > 0 || stats.removals > 0 ? (
			<View className="flex-row items-center gap-1.5">
				{stats.additions > 0 ? (
					<Text className="text-green-500 text-xs">+{stats.additions}</Text>
				) : null}
				{stats.removals > 0 ? (
					<Text className="text-red-500 text-xs">-{stats.removals}</Text>
				) : null}
			</View>
		) : null;

	// Extra header element: "Open" button/dropdown (outside trigger so it doesn't toggle expansion)
	const headerExtra =
		hasOpenMenu && filePath ? (
			<DropdownMenu>
				<DropdownMenuTrigger
					accessibilityLabel={`Open ${filePath}`}
					className="mr-1 flex-row items-center gap-1 rounded px-1 py-0.5"
				>
					<Icon
						as={ExternalLinkIcon}
						className="size-3 text-muted-foreground"
					/>
					<Text className="text-muted-foreground text-xs">Open</Text>
					<Icon as={ChevronDownIcon} className="size-3 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onPress={() => onFilePathClick?.(filePath)}>
						<Text>Open in File pane</Text>
					</DropdownMenuItem>
					<DropdownMenuItem onPress={() => onDiffPathClick?.(filePath)}>
						<Text>Open in Changes pane</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		) : canOpenFile && filePath ? (
			<Pressable
				accessibilityLabel={`Open ${filePath}`}
				accessibilityRole="button"
				className="mr-1 flex-row items-center gap-1 rounded px-1 py-0.5"
				onPress={() => onFilePathClick?.(filePath)}
			>
				<Icon as={ExternalLinkIcon} className="size-3 text-muted-foreground" />
				<Text className="text-muted-foreground text-xs">Open</Text>
			</Pressable>
		) : undefined;

	return (
		<ToolCallRow
			className={className}
			headerExtra={headerExtra}
			icon={FileCode2Icon}
			isPending={isStreaming}
			statusNode={statusNode}
			title={titleNode}
		>
			{hasDiff ? (
				renderExpandedContent ? (
					<View>{renderExpandedContent(expandedContentProps)}</View>
				) : (
					<DiffLines lines={diffLines} />
				)
			) : isStreaming ? (
				<View className="px-2.5 py-1.5">
					<Text className="font-mono text-muted-foreground/50 text-xs">
						...
					</Text>
				</View>
			) : undefined}
		</ToolCallRow>
	);
};
