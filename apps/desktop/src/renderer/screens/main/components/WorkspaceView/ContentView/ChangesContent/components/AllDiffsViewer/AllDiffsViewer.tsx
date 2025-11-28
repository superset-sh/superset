import { useCallback, useEffect, useMemo, useRef } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { type ListChildComponentProps, VariableSizeList } from "react-window";
import { useClearScrollTarget, useScrollToFilePath } from "renderer/stores";
import type { DiffHunk, DiffLine as DiffLineType, FileDiff } from "../../types";
import { DiffHeader } from "../DiffHeader";
import { DiffHunkHeader } from "../DiffHunkHeader";
import { DiffLine } from "../DiffLine";

interface AllDiffsViewerProps {
	diffs: FileDiff[];
}

/**
 * Flattened item types for the virtualized list
 */
type FlatItem =
	| { type: "file-header"; diff: FileDiff; fileIndex: number }
	| { type: "hunk-header"; header: string }
	| { type: "line"; line: DiffLineType; language: string }
	| { type: "file-spacer" }
	| { type: "binary-notice" }
	| { type: "empty-diff" };

const LINE_HEIGHT = 24;
const HEADER_HEIGHT = 40;
const SPACER_HEIGHT = 24;

/**
 * Count additions and deletions in hunks
 */
function countChanges(hunks: DiffHunk[]): {
	additions: number;
	deletions: number;
} {
	let additions = 0;
	let deletions = 0;
	for (const hunk of hunks) {
		for (const line of hunk.lines) {
			if (line.type === "addition") additions++;
			if (line.type === "deletion") deletions++;
		}
	}
	return { additions, deletions };
}

/**
 * Flatten all diffs into a single list and track file positions
 */
function flattenDiffs(diffs: FileDiff[]): {
	items: FlatItem[];
	filePositions: Map<string, number>;
} {
	const items: FlatItem[] = [];
	const filePositions = new Map<string, number>();

	for (let fileIndex = 0; fileIndex < diffs.length; fileIndex++) {
		const diff = diffs[fileIndex];

		// Track file position (index in flattened list)
		filePositions.set(diff.path, items.length);

		// Add file header
		items.push({ type: "file-header", diff, fileIndex });

		if (diff.isBinary) {
			items.push({ type: "binary-notice" });
		} else if (diff.hunks.length === 0) {
			items.push({ type: "empty-diff" });
		} else {
			// Add all hunks and lines
			for (const hunk of diff.hunks) {
				items.push({ type: "hunk-header", header: hunk.header });
				for (const line of hunk.lines) {
					items.push({ type: "line", line, language: diff.language });
				}
			}
		}

		// Add spacer between files (except after last file)
		if (fileIndex < diffs.length - 1) {
			items.push({ type: "file-spacer" });
		}
	}

	return { items, filePositions };
}

export function AllDiffsViewer({ diffs }: AllDiffsViewerProps) {
	const listRef = useRef<VariableSizeList>(null);

	// Store state for scroll-to functionality
	const scrollToFilePath = useScrollToFilePath();
	const clearScrollTarget = useClearScrollTarget();

	// Flatten all diffs into a single list
	const { items, filePositions } = useMemo(() => flattenDiffs(diffs), [diffs]);

	// Pre-calculate changes for each file (for headers)
	const fileChanges = useMemo(() => {
		return diffs.map((diff) => countChanges(diff.hunks));
	}, [diffs]);

	// Get item size based on type
	const getItemSize = useCallback(
		(index: number): number => {
			const item = items[index];
			switch (item.type) {
				case "file-header":
					return HEADER_HEIGHT;
				case "hunk-header":
					return LINE_HEIGHT;
				case "line":
					return LINE_HEIGHT;
				case "file-spacer":
					return SPACER_HEIGHT;
				case "binary-notice":
					return 48;
				case "empty-diff":
					return 48;
				default:
					return LINE_HEIGHT;
			}
		},
		[items],
	);

	// Handle scroll-to-file when store state changes
	useEffect(() => {
		if (scrollToFilePath && listRef.current) {
			const position = filePositions.get(scrollToFilePath);
			if (position !== undefined) {
				listRef.current.scrollToItem(position, "start");
			}
			// Clear the scroll target after scrolling
			clearScrollTarget();
		}
	}, [scrollToFilePath, filePositions, clearScrollTarget]);

	// Row renderer
	const Row = useCallback(
		({ index, style }: ListChildComponentProps) => {
			const item = items[index];

			switch (item.type) {
				case "file-header": {
					const changes = fileChanges[item.fileIndex];
					return (
						<div style={style}>
							<DiffHeader
								filePath={item.diff.path}
								additions={changes.additions}
								deletions={changes.deletions}
								language={item.diff.language}
							/>
						</div>
					);
				}

				case "hunk-header":
					return <DiffHunkHeader header={item.header} style={style} />;

				case "line":
					return (
						<DiffLine line={item.line} language={item.language} style={style} />
					);

				case "file-spacer":
					return (
						<div
							style={style}
							className="border-b border-border bg-background"
						/>
					);

				case "binary-notice":
					return (
						<div
							style={style}
							className="flex items-center justify-center text-muted-foreground text-sm"
						>
							Binary file not shown
						</div>
					);

				case "empty-diff":
					return (
						<div
							style={style}
							className="flex items-center justify-center text-muted-foreground text-sm"
						>
							No changes
						</div>
					);

				default:
					return null;
			}
		},
		[items, fileChanges],
	);

	return (
		<div className="flex-1 h-full flex flex-col bg-background">
			<AutoSizer>
				{({ height, width }) => (
					<VariableSizeList
						ref={listRef}
						height={height}
						width={width}
						itemCount={items.length}
						itemSize={getItemSize}
						overscanCount={20}
					>
						{Row}
					</VariableSizeList>
				)}
			</AutoSizer>
		</div>
	);
}
