import { useCallback, useMemo, useRef } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { DiffHeader } from "../DiffHeader";
import { DiffHunkHeader } from "../DiffHunkHeader";
import { DiffLine } from "../DiffLine";
import type { DiffHunk, DiffLine as DiffLineType, FileDiff } from "../../types";

interface DiffViewerProps {
	diff: FileDiff;
}

/**
 * Flattened line item for virtualized list
 */
interface FlatLine {
	type: "hunk-header" | "line";
	hunkHeader?: string;
	line?: DiffLineType;
}

/**
 * Flatten hunks into a single array for virtualized rendering
 */
function flattenHunks(hunks: DiffHunk[]): FlatLine[] {
	const flatLines: FlatLine[] = [];

	for (const hunk of hunks) {
		// Add hunk header
		flatLines.push({
			type: "hunk-header",
			hunkHeader: hunk.header,
		});

		// Add all lines
		for (const line of hunk.lines) {
			flatLines.push({
				type: "line",
				line,
			});
		}
	}

	return flatLines;
}

/**
 * Count total additions and deletions
 */
function countChanges(hunks: DiffHunk[]): { additions: number; deletions: number } {
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

const LINE_HEIGHT = 24;

export function DiffViewer({ diff }: DiffViewerProps) {
	const listRef = useRef<FixedSizeList>(null);

	// Flatten hunks for virtualized rendering
	const flatLines = useMemo(() => flattenHunks(diff.hunks), [diff.hunks]);

	// Count additions/deletions for header
	const { additions, deletions } = useMemo(
		() => countChanges(diff.hunks),
		[diff.hunks],
	);

	// Row renderer for react-window
	const Row = useCallback(
		({ index, style }: ListChildComponentProps) => {
			const item = flatLines[index];

			if (item.type === "hunk-header" && item.hunkHeader) {
				return <DiffHunkHeader header={item.hunkHeader} style={style} />;
			}

			if (item.type === "line" && item.line) {
				return (
					<DiffLine line={item.line} language={diff.language} style={style} />
				);
			}

			return null;
		},
		[flatLines, diff.language],
	);

	// Binary file handling
	if (diff.isBinary) {
		return (
			<div className="flex-1 h-full overflow-auto bg-background">
				<DiffHeader
					filePath={diff.path}
					additions={0}
					deletions={0}
					language={diff.language}
				/>
				<div className="flex items-center justify-center h-32 text-muted-foreground">
					Binary file not shown
				</div>
			</div>
		);
	}

	// Empty diff handling
	if (flatLines.length === 0) {
		return (
			<div className="flex-1 h-full overflow-auto bg-background">
				<DiffHeader
					filePath={diff.path}
					additions={0}
					deletions={0}
					language={diff.language}
				/>
				<div className="flex items-center justify-center h-32 text-muted-foreground">
					No changes
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 h-full flex flex-col bg-background">
			<DiffHeader
				filePath={diff.path}
				additions={additions}
				deletions={deletions}
				language={diff.language}
			/>
			<div className="flex-1">
				<AutoSizer>
					{({ height, width }) => (
						<FixedSizeList
							ref={listRef}
							height={height}
							width={width}
							itemCount={flatLines.length}
							itemSize={LINE_HEIGHT}
							overscanCount={20}
						>
							{Row}
						</FixedSizeList>
					)}
				</AutoSizer>
			</div>
		</div>
	);
}
