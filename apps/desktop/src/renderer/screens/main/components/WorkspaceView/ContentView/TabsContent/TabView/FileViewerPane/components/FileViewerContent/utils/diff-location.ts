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

function getLineCount(lines: number | string[]): number {
	return typeof lines === "number" ? lines : lines.length;
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
	if (!Number.isFinite(lineNumber)) return 1;
	return Math.max(1, Math.min(lineNumber, modifiedLines.length));
}

function parseHunkStartLines(hunkSpecs: string | undefined): {
	additionStart: number | null;
	deletionStart: number | null;
} {
	if (!hunkSpecs) {
		return {
			additionStart: null,
			deletionStart: null,
		};
	}

	const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(hunkSpecs);
	if (!match) {
		return {
			additionStart: null,
			deletionStart: null,
		};
	}

	const deletionStart = Number.parseInt(match[1], 10);
	const additionStart = Number.parseInt(match[2], 10);

	return {
		additionStart: Number.isFinite(additionStart) ? additionStart : null,
		deletionStart: Number.isFinite(deletionStart) ? deletionStart : null,
	};
}

function resolveHunkStartLine(
	hunk: {
		additionStart?: number;
		deletionStart?: number;
		hunkSpecs?: string;
	},
	side: "addition" | "deletion",
): number {
	const directStart =
		side === "addition" ? hunk.additionStart : hunk.deletionStart;
	if (typeof directStart === "number" && Number.isFinite(directStart)) {
		return directStart;
	}

	const parsedStartLines = parseHunkStartLines(hunk.hunkSpecs);
	const parsedStart =
		side === "addition"
			? parsedStartLines.additionStart
			: parsedStartLines.deletionStart;

	return parsedStart ?? 1;
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

let measurementCanvas: HTMLCanvasElement | null = null;

function getMeasurementContext(): CanvasRenderingContext2D | null {
	if (!measurementCanvas) {
		measurementCanvas = document.createElement("canvas");
	}

	return measurementCanvas.getContext("2d");
}

function measureColumnFromRenderedText(
	codeElement: HTMLElement,
	clientX: number,
): number {
	const lineText = codeElement.textContent ?? "";
	if (lineText.length === 0) {
		return 1;
	}

	const rect = codeElement.getBoundingClientRect();
	if (clientX <= rect.left) {
		return 1;
	}

	const style = window.getComputedStyle(codeElement);
	const context = getMeasurementContext();
	if (!context) {
		return 1;
	}

	context.font = [
		style.fontStyle,
		style.fontVariant,
		style.fontWeight,
		style.fontSize,
		style.fontFamily,
	]
		.filter(Boolean)
		.join(" ");

	const tabSize = Number.parseInt(style.tabSize || "4", 10);
	const safeTabSize = Number.isFinite(tabSize) && tabSize > 0 ? tabSize : 4;
	const targetX = clientX - rect.left;
	let previousWidth = 0;
	let renderedText = "";
	const characters = Array.from(lineText);

	for (let index = 0; index < characters.length; index += 1) {
		renderedText +=
			characters[index] === "\t" ? " ".repeat(safeTabSize) : characters[index];
		const nextWidth = context.measureText(renderedText).width;
		const midpoint = previousWidth + (nextWidth - previousWidth) / 2;

		if (targetX <= midpoint) {
			return index + 1;
		}

		previousWidth = nextWidth;
	}

	return characters.length + 1;
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
		const deletionStart = resolveHunkStartLine(hunk, "deletion");
		const additionStart = resolveHunkStartLine(hunk, "addition");

		if (lineNumber < deletionStart) {
			return clampLineNumber(lineNumber + lineDelta, modifiedLines);
		}

		let currentOldLine = deletionStart;
		let currentNewLine = additionStart;

		for (const chunk of hunk.hunkContent) {
			if (chunk.type === "context") {
				const contextLineCount = getLineCount(chunk.lines);

				for (let index = 0; index < contextLineCount; index += 1) {
					if (currentOldLine === lineNumber) {
						return clampLineNumber(currentNewLine, modifiedLines);
					}

					currentOldLine += 1;
					currentNewLine += 1;
				}
				continue;
			}

			const insertionLine = clampLineNumber(currentNewLine, modifiedLines);
			const deletionLineCount = getLineCount(chunk.deletions);
			const additionLineCount = getLineCount(chunk.additions);

			for (let index = 0; index < deletionLineCount; index += 1) {
				if (currentOldLine === lineNumber) {
					return insertionLine;
				}
				currentOldLine += 1;
			}

			currentNewLine += additionLineCount;
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

	return measureColumnFromRenderedText(codeElement, clientX);
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

export function getDiffLocationFromEvent(
	event: Pick<Event, "target" | "composedPath">,
): DiffDomLocation | null {
	const composedPath = event.composedPath();

	for (const pathEntry of composedPath) {
		const location = getDiffLocationFromTarget(pathEntry ?? null);
		if (location) {
			return location;
		}
	}

	return getDiffLocationFromTarget(event.target);
}
