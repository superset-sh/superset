import type { CellObject } from "xlsx";

const QUOTE = 0x22;
const LF = 0x0a;
const CR = 0x0d;
const SNIFF_CHARS = 64 * 1024;
const SNIFF_RECORDS = 100;
const CANDIDATES = [",", "\t", ";", "|"];

export interface DelimitedText {
	text: string;
	separator: string;
}

/** A leading `sep=;` line names the separator, as Excel writes it. */
export function delimitedSource(
	text: string,
	fallback: string | null,
): DelimitedText {
	const declared = /^sep=(.)(\r\n|\r|\n)/.exec(text);
	if (declared?.[1]) {
		return { text: text.slice(declared[0].length), separator: declared[1] };
	}
	return { text, separator: fallback ?? guessSeparator(text) };
}

/** Fields per record over the head of the text, quotes respected. */
function fieldCounts(text: string, separator: string): number[] {
	const counts: number[] = [];
	const end = Math.min(text.length, SNIFF_CHARS);
	let quoted = false;
	let fields = 1;
	let empty = true;
	for (let i = 0; i < end && counts.length < SNIFF_RECORDS; i += 1) {
		const char = text[i];
		if (char === '"') quoted = !quoted;
		else if (quoted) continue;
		else if (char === separator) fields += 1;
		else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i += 1;
			if (!empty || fields > 1) counts.push(fields);
			fields = 1;
			empty = true;
			continue;
		}
		empty = false;
	}
	// A record cut by the sniff window would skew the counts.
	if (end === text.length && (!empty || fields > 1)) counts.push(fields);
	return counts;
}

/**
 * The candidate that splits the most records into the same number of fields,
 * then the one with more fields; on a tie, the earlier one.
 */
export function guessSeparator(text: string): string {
	let best = ",";
	let bestShare = 0;
	let bestFields = 1;
	for (const candidate of CANDIDATES) {
		const counts = fieldCounts(text, candidate);
		const frequency = new Map<number, number>();
		for (const count of counts) {
			frequency.set(count, (frequency.get(count) ?? 0) + 1);
		}
		let fields = 1;
		let records = 0;
		for (const [count, seen] of frequency) {
			if (seen > records || (seen === records && count > fields)) {
				fields = count;
				records = seen;
			}
		}
		if (fields < 2) continue;
		const share = records / counts.length;
		if (share > bestShare || (share === bestShare && fields > bestFields)) {
			best = candidate;
			bestShare = share;
			bestFields = fields;
		}
	}
	return best;
}

/**
 * RFC 4180 fields, kept as written: no number, date or formula guessing.
 * Empty fields are holes, but each row is as long as its record.
 */
export function parseDelimitedText(
	text: string,
	separator: string,
): CellObject[][] {
	const sep = separator.charCodeAt(0);
	const length = text.length;
	const rows: CellObject[][] = [];
	let row: CellObject[] = [];
	let col = 0;
	let i = 0;

	const fieldEnd = (from: number) => {
		let end = from;
		while (end < length) {
			const code = text.charCodeAt(end);
			if (code === sep || code === LF || code === CR) break;
			end += 1;
		}
		return end;
	};

	while (i < length) {
		let value: string;
		if (text.charCodeAt(i) === QUOTE) {
			value = "";
			let from = i + 1;
			for (;;) {
				const close = text.indexOf('"', from);
				if (close === -1) {
					value += text.slice(from);
					i = length;
					break;
				}
				value += text.slice(from, close);
				if (text.charCodeAt(close + 1) === QUOTE) {
					value += '"';
					from = close + 2;
					continue;
				}
				i = close + 1;
				break;
			}
			const end = fieldEnd(i);
			value += text.slice(i, end);
			i = end;
		} else {
			const end = fieldEnd(i);
			value = text.slice(i, end);
			i = end;
		}
		if (value) row[col] = { t: "s", v: value, w: value };

		const code = text.charCodeAt(i);
		if (code === sep) {
			col += 1;
			i += 1;
			continue;
		}
		row.length = col + 1;
		rows.push(row);
		row = [];
		col = 0;
		if (code === CR) i += text.charCodeAt(i + 1) === LF ? 2 : 1;
		else if (code === LF) i += 1;
	}
	if (col > 0 || row.length > 0) {
		row.length = col + 1;
		rows.push(row);
	}
	return rows;
}
