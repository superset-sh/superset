import { describe, expect, test } from "bun:test";
import {
	type BidiCell,
	computeBidiRow,
	glyphFont,
	isCursorInRtl,
	mirrorCell,
} from "./terminal-bidi";

function cellsOf(text: string): BidiCell[] {
	return Array.from(text, (ch) => ({
		codePoint: ch.codePointAt(0) ?? 0,
		width: 1,
	}));
}

/** What the renderer draws: logical cells in visual order, mirrored where flagged. */
function visual(text: string, alignRight = false): string {
	const cells = cellsOf(text);
	const row = computeBidiRow(cells, alignRight);
	if (!row) return text;
	return Array.from(row.order, (logical, x) => {
		const cell = { content: cells[logical].codePoint };
		if (row.mirror[x]) mirrorCell(cell);
		return String.fromCodePoint(cell.content);
	}).join("");
}

describe("computeBidiRow", () => {
	test("leaves rows without RTL text untouched", () => {
		expect(computeBidiRow(cellsOf("hello (world) 42"))).toBeNull();
	});

	test("reverses a Hebrew word", () => {
		expect(visual("שלום")).toBe("םולש");
	});

	test("keeps surrounding LTR text in place", () => {
		expect(visual("hello שלום world")).toBe("hello םולש world");
	});

	test("orders Hebrew words right-to-left", () => {
		expect(visual("שלום עולם")).toBe("םלוע םולש");
	});

	test("keeps numbers left-to-right inside Hebrew", () => {
		expect(visual("גרסה 12 עכשיו")).toBe("וישכע 12 הסרג");
	});

	test("mirrors brackets inside an RTL run", () => {
		expect(visual("א (ב) ג")).toBe("ג (ב) א");
	});

	test("brackets at the LTR edge stay as typed", () => {
		expect(visual("(שלום)")).toBe("(םולש)");
	});

	test("trailing empty cells stay at the end", () => {
		const cells = [
			...cellsOf("שלום"),
			{ codePoint: 0, width: 1 },
			{ codePoint: 0, width: 1 },
		];
		expect(Array.from(computeBidiRow(cells)?.order ?? [])).toEqual([
			3, 2, 1, 0, 4, 5,
		]);
	});

	test("never splits a wide char from its tail cell", () => {
		const cells: BidiCell[] = [
			...cellsOf("אב "),
			{ codePoint: 0x1f600, width: 2 },
			{ codePoint: 0, width: 0 },
			...cellsOf(" גד"),
		];
		const order = Array.from(computeBidiRow(cells)?.order ?? []);
		expect(order.indexOf(4)).toBe(order.indexOf(3) + 1);
	});

	test("is a permutation of the row", () => {
		const row = computeBidiRow(cellsOf("ab שלום 3 (x) עולם cd"));
		expect([...(row?.order ?? [])].sort((a, b) => a - b)).toEqual(
			Array.from({ length: row?.order.length ?? 0 }, (_, i) => i),
		);
	});
	test("keeps times and versions intact inside Hebrew", () => {
		expect(visual("לא לפני 19:00")).toBe("19:00 ינפל אל");
		expect(visual("גרסה 2.1 עובדת")).toBe("תדבוע 2.1 הסרג");
	});

	test("keeps a bracket pair around Hebrew together", () => {
		expect(visual("אישי [לא חובה].")).toBe("[הבוח אל] ישיא.");
	});
	describe("alignRight", () => {
		test("pushes a Hebrew row against the right edge", () => {
			expect(visual("שלום    ", true)).toBe("    םולש");
		});

		test("keeps LTR islands readable inside a right-aligned row", () => {
			expect(visual("  - כל הכלים: git 3.12", true)).toBe(
				"git 3.12 :םילכה לכ -  ",
			);
		});

		test("leaves rows that start in English left-aligned", () => {
			expect(visual("Mixed: שלום  ", true)).toBe("Mixed: םולש  ");
		});
	});

	test("visualOf is the inverse of order", () => {
		const row = computeBidiRow(cellsOf("ab שלום (x) 12 עולם"), true);
		row?.order.forEach((logical, x) => {
			expect(row.visualOf[logical]).toBe(x);
		});
	});

	test("levels mark Hebrew odd and Latin even", () => {
		const row = computeBidiRow(cellsOf("ab שלום"));
		expect(Array.from(row?.levels ?? [])).toEqual([0, 0, 0, 1, 1, 1, 1]);
	});
});

describe("glyphFont", () => {
	test("puts the system font first for Hebrew glyphs only", () => {
		expect(glyphFont("ש")).toBe("system-ui, ");
		expect(glyphFont("a")).toBe("");
		expect(glyphFont("─")).toBe("");
	});
});

describe("isCursorInRtl", () => {
	test("follows the text just before the caret", () => {
		const row = computeBidiRow(cellsOf("ab שלום  "));
		expect(isCursorInRtl(row, 2)).toBe(false); // after "ab "
		expect(isCursorInRtl(row, 5)).toBe(true); // inside "שלום"
		expect(isCursorInRtl(row, 7)).toBe(true); // right after "שלום"
		expect(isCursorInRtl(null, 3)).toBe(false); // row without RTL
	});
});
