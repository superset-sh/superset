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

export interface DiffDomLocation {
	lineElement: HTMLElement;
	lineNumber: number;
	side: AnnotationSide;
	lineType: LineTypes;
	numberColumn: boolean;
}

export interface RawEditorPosition {
	lineNumber: number;
	column: number;
}

function isSupportedLineType(lineType: string): lineType is LineTypes {
	return (
		lineType === "context" ||
		lineType === "context-expanded" ||
		lineType === "change-deletion" ||
		lineType === "change-addition"
	);
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

function mapOldSideLineToRawLine(
	contents: FileContents,
	lineNumber: number,
): number {
	const modifiedLines = contents.modified.split("\n");
	const diff = parseDiffFromFile(
		{ name: "before", contents: contents.original },
		{ name: "after", contents: contents.modified },
	);
	let lineDelta = 0;

	for (const hunk of diff.hunks) {
		if (lineNumber < hunk.deletionStart) {
			return clampLineNumber(lineNumber + lineDelta, modifiedLines);
		}

		let currentOldLine = hunk.deletionStart;
		let currentNewLine = hunk.additionStart;

		for (const chunk of hunk.hunkContent) {
			if (chunk.type === "context") {
				for (let index = 0; index < chunk.lines.length; index += 1) {
					if (currentOldLine === lineNumber) {
						return clampLineNumber(currentNewLine, modifiedLines);
					}

					currentOldLine += 1;
					currentNewLine += 1;
				}
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

		lineDelta = currentNewLine - currentOldLine;
	}

	return clampLineNumber(lineNumber + lineDelta, modifiedLines);
}

export function mapDiffLocationToRawPosition({
	contents,
	lineNumber,
	side,
	column,
}: MapDiffLocationToRawPositionOptions): RawEditorPosition {
	const modifiedLines = contents.modified.split("\n");

	const rawLineNumber =
		side === "additions"
			? clampLineNumber(lineNumber, modifiedLines)
			: mapOldSideLineToRawLine(contents, lineNumber);

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

export function getDiffLocationFromTarget(
	target: EventTarget | null,
): DiffDomLocation | null {
	if (!(target instanceof Node)) {
		return null;
	}

	const targetElement =
		target instanceof HTMLElement ? target : target.parentElement;
	const lineElement = targetElement?.closest("[data-line]");
	if (!(lineElement instanceof HTMLElement)) {
		return null;
	}

	const rawLineNumber = Number.parseInt(lineElement.dataset.line ?? "", 10);
	const lineType = lineElement.dataset.lineType;
	if (
		!Number.isFinite(rawLineNumber) ||
		!lineType ||
		!isSupportedLineType(lineType)
	) {
		return null;
	}

	const numberColumn = !!targetElement?.closest("[data-column-number]");
	const parentCode = lineElement.closest("[data-code]");
	const side: AnnotationSide =
		lineType === "change-deletion"
			? "deletions"
			: lineType === "change-addition"
				? "additions"
				: parentCode instanceof HTMLElement && "deletions" in parentCode.dataset
					? "deletions"
					: "additions";

	return {
		lineElement,
		lineNumber: rawLineNumber,
		side,
		lineType,
		numberColumn,
	};
}
