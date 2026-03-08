import { parseDiffFromFile } from "@pierre/diffs";
import type { AnnotationSide, LineTypes } from "@pierre/diffs/react";
import type { FileContents } from "shared/changes-types";

interface MapDiffLocationToRawPositionOptions {
	contents: FileContents;
	lineNumber: number;
	side: AnnotationSide;
	lineType: LineTypes;
	column?: number;
}

interface DiffClickColumnOptions {
	lineElement: HTMLElement;
	numberColumn?: boolean;
}

export interface RawEditorPosition {
	lineNumber: number;
	column: number;
}

function clampLineNumber(lineNumber: number, modifiedLines: string[]): number {
	if (modifiedLines.length === 0) return 1;
	return Math.max(1, Math.min(lineNumber, modifiedLines.length));
}

function clampColumn(
	lineNumber: number,
	column: number | undefined,
	modifiedLines: string[],
): number {
	const safeLineNumber = clampLineNumber(lineNumber, modifiedLines);
	const lineContent = modifiedLines[safeLineNumber - 1] ?? "";
	const requestedColumn = column ?? 1;

	return Math.max(1, Math.min(requestedColumn, lineContent.length + 1));
}

function mapDeletedLineToRawLine(
	contents: FileContents,
	lineNumber: number,
): number {
	const modifiedLines = contents.modified.split("\n");
	const diff = parseDiffFromFile(
		{ name: "before", contents: contents.original },
		{ name: "after", contents: contents.modified },
	);

	for (const hunk of diff.hunks) {
		let currentOldLine = hunk.deletionStart;
		let currentNewLine = hunk.additionStart;

		for (const chunk of hunk.hunkContent) {
			if (chunk.type === "context") {
				currentOldLine += chunk.lines.length;
				currentNewLine += chunk.lines.length;
				continue;
			}

			const insertionLine = clampLineNumber(currentNewLine, modifiedLines);

			for (let index = 0; index < chunk.deletions.length; index += 1) {
				if (currentOldLine === lineNumber) {
					return insertionLine;
				}
				currentOldLine += 1;
			}

			currentNewLine += chunk.additions.length;
		}
	}

	return clampLineNumber(lineNumber, modifiedLines);
}

export function mapDiffLocationToRawPosition({
	contents,
	lineNumber,
	side,
	lineType,
	column,
}: MapDiffLocationToRawPositionOptions): RawEditorPosition {
	const modifiedLines = contents.modified.split("\n");

	const rawLineNumber =
		lineType === "context" ||
		lineType === "context-expanded" ||
		side === "additions"
			? clampLineNumber(lineNumber, modifiedLines)
			: mapDeletedLineToRawLine(contents, lineNumber);

	return {
		lineNumber: rawLineNumber,
		column: clampColumn(rawLineNumber, column, modifiedLines),
	};
}

export function getColumnFromDiffSelection({
	lineElement,
	numberColumn = false,
}: DiffClickColumnOptions): number {
	if (numberColumn) {
		return 1;
	}

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return 1;
	}

	const range = selection.getRangeAt(0);
	const anchorNode = range.startContainer;
	if (!lineElement.contains(anchorNode)) {
		return 1;
	}

	const measureRange = document.createRange();
	measureRange.selectNodeContents(lineElement);
	measureRange.setEnd(anchorNode, range.startOffset);

	return Math.max(1, measureRange.toString().length + 1);
}
