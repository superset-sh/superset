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

interface DiffPointColumnOptions extends DiffClickColumnOptions {
	clientX: number;
	clientY: number;
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

export interface RawEditorRange {
	startLine: number;
	endLine: number;
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

function getDiffCodeElement(lineElement: HTMLElement): HTMLElement {
	const codeElement = lineElement.querySelector("[data-code]");
	return codeElement instanceof HTMLElement ? codeElement : lineElement;
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

export function getRawSectionForDiffLocation({
	contents,
	lineNumber,
	side,
}: Pick<
	MapDiffLocationToRawPositionOptions,
	"contents" | "lineNumber" | "side"
>): RawEditorRange | null {
	const modifiedLines = contents.modified.split("\n");
	const diff = parseDiffFromFile(
		{ name: "before", contents: contents.original },
		{ name: "after", contents: contents.modified },
	);

	for (const hunk of diff.hunks) {
		let currentOldLine = hunk.deletionStart;
		let currentNewLine = hunk.additionStart;
		let containsLocation = false;

		for (const chunk of hunk.hunkContent) {
			if (chunk.type === "context") {
				const contextLineCount = chunk.lines.length;

				if (
					side === "additions" &&
					lineNumber >= currentNewLine &&
					lineNumber < currentNewLine + contextLineCount
				) {
					containsLocation = true;
					break;
				}

				if (
					side === "deletions" &&
					lineNumber >= currentOldLine &&
					lineNumber < currentOldLine + contextLineCount
				) {
					containsLocation = true;
					break;
				}

				currentOldLine += contextLineCount;
				currentNewLine += contextLineCount;
				continue;
			}

			if (
				side === "deletions" &&
				lineNumber >= currentOldLine &&
				lineNumber < currentOldLine + chunk.deletions.length
			) {
				containsLocation = true;
				break;
			}

			if (
				side === "additions" &&
				lineNumber >= currentNewLine &&
				lineNumber < currentNewLine + chunk.additions.length
			) {
				containsLocation = true;
				break;
			}

			currentOldLine += chunk.deletions.length;
			currentNewLine += chunk.additions.length;
		}

		if (!containsLocation) {
			continue;
		}

		const rawStartLine = clampLineNumber(hunk.additionStart, modifiedLines);
		const rawEndLine = clampLineNumber(
			Math.max(hunk.additionStart, hunk.additionStart + hunk.additionCount - 1),
			modifiedLines,
		);

		return {
			startLine: rawStartLine,
			endLine: rawEndLine,
		};
	}

	return null;
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

export function getColumnFromDiffPoint({
	lineElement,
	clientX,
	clientY,
	numberColumn = false,
}: DiffPointColumnOptions): number {
	if (numberColumn) {
		return 1;
	}

	const codeElement = getDiffCodeElement(lineElement);
	const documentWithCaretApi = document as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number,
		) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	const caretPosition = documentWithCaretApi.caretPositionFromPoint?.(
		clientX,
		clientY,
	);
	if (caretPosition && codeElement.contains(caretPosition.offsetNode)) {
		const measureRange = document.createRange();
		measureRange.selectNodeContents(codeElement);
		measureRange.setEnd(caretPosition.offsetNode, caretPosition.offset);
		return Math.max(1, measureRange.toString().length + 1);
	}

	const caretRange = documentWithCaretApi.caretRangeFromPoint?.(
		clientX,
		clientY,
	);
	if (caretRange && codeElement.contains(caretRange.startContainer)) {
		const measureRange = document.createRange();
		measureRange.selectNodeContents(codeElement);
		measureRange.setEnd(caretRange.startContainer, caretRange.startOffset);
		return Math.max(1, measureRange.toString().length + 1);
	}

	return 1;
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
