import type { NumberSeparators } from "@superset/i18n/format";
import { getFileExtension } from "@superset/shared/media-files";
import {
	type CellObject,
	CFB,
	read,
	SSF,
	utils,
	type WorkBook,
	type WorkSheet,
} from "xlsx";
import type {
	CellKind,
	CellRange,
	CellWindow,
	CopyResult,
	FrozenPane,
	GridCell,
	SearchResult,
	SheetSummary,
	UnreadableReason,
	WorkbookSource,
} from "../../types";
import { delimitedSource, parseDelimitedText } from "../delimitedText";
import {
	type ArchiveFiles,
	NO_FREEZE,
	parseOpenDocumentFrozenPanes,
	readFrozenPanes,
} from "../frozenPanes";

const WIDTH_SAMPLE_ROWS = 1000;
const MAX_SAMPLED_CHARS = 60;
const ZIP_EXTENSIONS = new Set(["xlsx", "xlsm", "xlsb", "ods"]);
const NUMERIC_TEXT =
	/^[-+(]?[$€£¥]?\s?\d[\d\s.,' {2}]*(?:[eE][-+]?\d+)?\s?[%$€£¥]?\)?$/;
// SheetJS formats numbers the en-US way: "," groups digits, "." starts decimals.
const EN_SEPARATOR = /\.(?=\d)|(?<=\d),(?=\d)/g;
// Text a number format prints as written: "quoted", \escaped, [$currency-locale].
const FORMAT_LITERAL = /"[^"]*"|\\.|\[\$[^\]-]+(?:-[^\]]*)?\]/g;
const LITERAL_MARK = 0xe000;
const LITERAL_MARKS = /[\ue000-\uf8ff]/g;
const TSV_NEEDS_QUOTES = /[\t\n\r"]/;
const DELIMITED_HEADER: FrozenPane = { rows: 1, cols: 0 };

export function* presentIndexes<T>(values: T[]): Generator<number> {
	for (const key in values) {
		if (Object.hasOwn(values, key)) yield Number(key);
	}
}

export interface CopyLimits {
	maxCells: number;
	maxChars: number;
}

export const COPY_LIMITS: CopyLimits = {
	maxCells: 1_000_000,
	maxChars: 4_000_000,
};

export class UnreadableWorkbookError extends Error {}

export interface WorkbookModel {
	sheets: SheetSummary[];
	/** Row i, column j of the result is cell (rowStart + i, colStart + j). */
	getCells(
		sheetIndex: number,
		window: CellWindow,
		numbers: NumberSeparators,
	): (GridCell | null)[][];
	search(
		sheetIndex: number,
		query: string,
		caseSensitive: boolean,
		limit: number,
		numbers: NumberSeparators,
	): SearchResult;
	/**
	 * The selected rectangle, empty cells included, as Excel and Numbers paste
	 * it back. Stops at the limits without walking the rest of the selection.
	 */
	rangeToTsv(
		sheetIndex: number,
		range: CellRange,
		numbers: NumberSeparators,
		limits?: CopyLimits,
	): CopyResult;
}

interface SheetData {
	summary: SheetSummary;
	rows: CellObject[][];
}

export function openWorkbook(source: WorkbookSource): WorkbookModel {
	const delimited = source.kind === "text";
	const sheets = delimited ? readDelimited(source) : readBytes(source);
	const display = (cell: CellObject | undefined, numbers: NumberSeparators) =>
		delimited ? cellText(cell) : localizedText(cell, numbers);

	return {
		sheets: sheets.map((sheet) => sheet.summary),
		getCells(sheetIndex, window, numbers) {
			const sheet = sheets[sheetIndex];
			if (!sheet) return [];
			const { rowCount, colCount } = sheet.summary;
			const result: (GridCell | null)[][] = [];
			const rowEnd = Math.min(window.rowEnd, rowCount);
			const colEnd = Math.min(window.colEnd, colCount);
			for (let r = window.rowStart; r < rowEnd; r += 1) {
				const source = sheet.rows[r];
				const row: (GridCell | null)[] = [];
				if (source) {
					const end = Math.min(colEnd, source.length);
					for (let c = window.colStart; c < end; c += 1) {
						const cell = toGridCell(source[c], delimited, numbers);
						if (cell) row[c - window.colStart] = cell;
					}
				}
				result.push(row);
			}
			return result;
		},
		search(sheetIndex, query, caseSensitive, limit, numbers) {
			const needle = caseSensitive ? query : query.toLowerCase();
			const matches: number[] = [];
			const rows = sheets[sheetIndex]?.rows;
			if (!needle || !rows) return { matches, truncated: false };
			for (const r of presentIndexes(rows)) {
				const row = rows[r];
				if (!row) continue;
				for (const c of presentIndexes(row)) {
					const text = display(row[c], numbers);
					if (!text) continue;
					const haystack = caseSensitive ? text : text.toLowerCase();
					if (!haystack.includes(needle)) continue;
					if (matches.length / 2 >= limit) {
						return { matches, truncated: true };
					}
					matches.push(r, c);
				}
			}
			return { matches, truncated: false };
		},
		rangeToTsv(sheetIndex, range, numbers, limits = COPY_LIMITS) {
			const sheet = sheets[sheetIndex];
			const parts: string[] = [];
			let cells = 0;
			let chars = 0;
			const result = (truncated: boolean): CopyResult => ({
				text: parts.join(""),
				cells,
				truncated,
			});
			if (!sheet) return result(false);
			const bottom = Math.min(range.bottom, sheet.summary.rowCount - 1);
			const right = Math.min(range.right, sheet.summary.colCount - 1);
			if (range.left > right) return result(false);
			for (let r = range.top; r <= bottom; r += 1) {
				if (r > range.top) {
					if (cells + 1 > limits.maxCells || chars + 1 > limits.maxChars) {
						return result(true);
					}
					parts.push("\n");
					chars += 1;
				}
				const row = sheet.rows[r];
				for (let c = range.left; c <= right; c += 1) {
					const field = row ? tsvField(display(row[c], numbers)) : "";
					const size = field.length + (c > range.left ? 1 : 0);
					if (cells + 1 > limits.maxCells || chars + size > limits.maxChars) {
						return result(true);
					}
					parts.push(c > range.left ? `\t${field}` : field);
					cells += 1;
					chars += size;
				}
			}
			return result(false);
		},
	};
}

function readDelimited(
	source: Extract<WorkbookSource, { kind: "text" }>,
): SheetData[] {
	const withoutBom =
		source.text.charCodeAt(0) === 0xfeff ? source.text.slice(1) : source.text;
	const tsv = getFileExtension(source.fileName) === "tsv";
	const { text, separator } = delimitedSource(withoutBom, tsv ? "\t" : null);
	const rows = parseDelimitedText(text, separator);
	let fields = 0;
	for (const row of rows) fields = Math.max(fields, row.length);
	const summary = summarize("Sheet1", false, rows, [], DELIMITED_HEADER, {
		rows: rows.length,
		cols: fields,
	});
	return [{ summary, rows }];
}

function readBytes(
	source: Extract<WorkbookSource, { kind: "bytes" }>,
): SheetData[] {
	const extension = getFileExtension(source.fileName);
	if (ZIP_EXTENSIONS.has(extension)) {
		// Office encrypts a workbook into an OLE container, the format of .xls too.
		if (hasOleSignature(source.bytes)) {
			if (isEncryptedPackage(source.bytes)) {
				throw new UnreadableWorkbookError("File is password-protected");
			}
		} else if (!hasZipSignature(source.bytes)) {
			throw new UnreadableWorkbookError("Not a valid workbook archive");
		}
	}
	const workbook = read(source.bytes, {
		type: "array",
		dense: true,
		cellFormula: true,
		cellHTML: false,
		cellNF: true,
		cellStyles: false,
		bookFiles: true,
	}) as WorkBook & { files?: ArchiveFiles };
	const frozen =
		extension === "ods"
			? openDocumentFrozenPanes(source.bytes, workbook.SheetNames)
			: readFrozenPanes(workbook.files);
	return workbook.SheetNames.map((name, index) => {
		const sheet = workbook.Sheets[name];
		const rows = (sheet?.["!data"] as CellObject[][] | undefined) ?? [];
		const summary = summarize(
			name,
			Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden),
			rows,
			mergesOf(sheet),
			frozen[index] ?? NO_FREEZE,
		);
		return { summary, rows };
	});
}

function hasZipSignature(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
	);
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function hasOleSignature(bytes: Uint8Array): boolean {
	return OLE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function isEncryptedPackage(bytes: Uint8Array): boolean {
	try {
		return Boolean(
			CFB.find(CFB.read(bytes, { type: "array" }), "EncryptedPackage"),
		);
	} catch {
		return false;
	}
}

function openDocumentFrozenPanes(
	bytes: Uint8Array,
	sheetNames: string[],
): FrozenPane[] {
	let settings = "";
	try {
		const entry = CFB.find(CFB.read(bytes, { type: "array" }), "settings.xml");
		if (entry?.content) {
			settings = new TextDecoder().decode(entry.content as Uint8Array);
		}
	} catch {
		return [];
	}
	return parseOpenDocumentFrozenPanes(settings, sheetNames);
}

function mergesOf(sheet: WorkSheet | undefined): CellRange[] {
	return (sheet?.["!merges"] ?? []).map((merge) => ({
		top: merge.s.r,
		left: merge.s.c,
		bottom: merge.e.r,
		right: merge.e.c,
	}));
}

function summarize(
	name: string,
	hidden: boolean,
	rows: CellObject[][],
	allMerges: CellRange[],
	frozen: FrozenPane,
	extent = { rows: 0, cols: 0 },
): SheetSummary {
	let rowCount = 0;
	let colCount = 0;
	const colChars: number[] = [];
	for (let r = 0; r < rows.length; r += 1) {
		const row = rows[r];
		if (!row) continue;
		for (let c = 0; c < row.length; c += 1) {
			const cell = row[c];
			const text = cellText(cell);
			if (!text && !cell?.f) continue;
			rowCount = r + 1;
			if (c + 1 > colCount) colCount = c + 1;
			if (r < WIDTH_SAMPLE_ROWS) {
				const chars = Math.min(longestLine(text), MAX_SAMPLED_CHARS);
				if (chars > (colChars[c] ?? 0)) colChars[c] = chars;
			}
		}
	}
	rowCount = Math.max(rowCount, extent.rows);
	colCount = Math.max(colCount, extent.cols);
	const merges = allMerges.filter(
		(merge) => merge.top < rowCount && merge.left < colCount,
	);
	for (const merge of merges) {
		rowCount = Math.max(rowCount, merge.bottom + 1);
		colCount = Math.max(colCount, merge.right + 1);
	}
	return {
		name,
		hidden,
		rowCount,
		colCount,
		colChars: Array.from({ length: colCount }, (_, c) => colChars[c] ?? 0),
		merges,
		frozen: {
			rows: Math.min(frozen.rows, rowCount),
			cols: Math.min(frozen.cols, colCount),
		},
	};
}

function longestLine(text: string): number {
	let longest = 0;
	for (const line of text.split("\n")) {
		if (line.length > longest) longest = line.length;
	}
	return longest;
}

export function cellText(cell: CellObject | undefined): string {
	if (!cell) return "";
	if (cell.w !== undefined) return cell.w;
	if (cell.v === undefined || cell.v === null) return "";
	try {
		return utils.format_cell(cell);
	} catch {
		return String(cell.v);
	}
}

function isLocalizedNumber(cell: CellObject | undefined): cell is CellObject {
	return (
		cell?.t === "n" && !(typeof cell.z === "string" && SSF.is_date(cell.z))
	);
}

function isEnglish(numbers: NumberSeparators): boolean {
	return numbers.group === "," && numbers.decimal === ".";
}

function swapSeparators(text: string, numbers: NumberSeparators): string {
	return text.replace(EN_SEPARATOR, (mark) =>
		mark === "." ? numbers.decimal : numbers.group,
	);
}

/**
 * The file's number format, written with the separators of the app language.
 * Text of the format stays as written: it is swapped for marks before the
 * number is formatted, and put back after.
 */
function localizedText(
	cell: CellObject | undefined,
	numbers: NumberSeparators,
): string {
	const text = cellText(cell);
	if (!isLocalizedNumber(cell) || isEnglish(numbers)) return text;
	const format = typeof cell.z === "string" ? cell.z : "";
	if (!format.match(FORMAT_LITERAL)) return swapSeparators(text, numbers);
	const literals: string[] = [];
	const masked = format.replace(FORMAT_LITERAL, (token) => {
		const literal = token.startsWith('"')
			? token.slice(1, -1)
			: token.startsWith("\\")
				? token.slice(1)
				: token.slice(2, -1).replace(/-.*$/, "");
		literals.push(literal);
		return `"${String.fromCharCode(LITERAL_MARK + literals.length - 1)}"`;
	});
	let formatted: string;
	try {
		formatted = SSF.format(masked, cell.v);
	} catch {
		return text;
	}
	return swapSeparators(formatted, numbers).replace(
		LITERAL_MARKS,
		(mark) => literals[mark.charCodeAt(0) - LITERAL_MARK] ?? mark,
	);
}

function tsvField(field: string): string {
	return TSV_NEEDS_QUOTES.test(field)
		? `"${field.replaceAll('"', '""')}"`
		: field;
}

function toGridCell(
	cell: CellObject | undefined,
	delimited: boolean,
	numbers: NumberSeparators,
): GridCell | null {
	if (!cell) return null;
	const text = delimited ? cellText(cell) : localizedText(cell, numbers);
	const formula = cell.f ? `=${cell.f}` : undefined;
	if (!text && !formula) return null;
	const kind = cellKind(cell, text, delimited);
	const value = rawValue(cell, numbers);
	return {
		text,
		kind,
		...(formula ? { formula } : {}),
		...(value !== undefined && value !== text ? { value } : {}),
	};
}

function cellKind(
	cell: CellObject,
	text: string,
	delimited: boolean,
): CellKind {
	if (delimited) return NUMERIC_TEXT.test(text.trim()) ? "number" : "text";
	switch (cell.t) {
		case "n":
		case "d":
			return "number";
		case "b":
			return "boolean";
		case "e":
			return "error";
		default:
			return "text";
	}
}

function rawValue(
	cell: CellObject,
	numbers: NumberSeparators,
): string | undefined {
	if (cell.v === undefined || cell.v === null) return undefined;
	if (cell.t === "b") return cell.v ? "TRUE" : "FALSE";
	if (cell.v instanceof Date) return cell.v.toISOString();
	if (cell.t === "n") return String(cell.v).replace(".", numbers.decimal);
	return String(cell.v);
}

export function unreadableReason(error: unknown): UnreadableReason | null {
	const message = error instanceof Error ? error.message : String(error);
	if (/password|encrypt/i.test(message)) return "password";
	if (/unsupported|not supported|not a spreadsheet/i.test(message)) {
		return "unsupported";
	}
	return null;
}
