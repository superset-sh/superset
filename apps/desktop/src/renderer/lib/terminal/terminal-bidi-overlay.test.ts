import { describe, expect, test } from "bun:test";
import { computeBidiRow } from "./terminal-bidi";
import {
	claimRow,
	layoutRow,
	type OverlayCell,
	type OverlayCellData,
	type OverlayRow,
	type TextStyle,
	takeCell,
} from "./terminal-bidi-overlay";

const plain: TextStyle = {
	color: "#fff",
	bold: false,
	italic: false,
	dim: false,
};
const bold: TextStyle = { ...plain, bold: true };

function rowOf(text: string, alignRight = true): OverlayRow {
	const row = computeBidiRow(
		Array.from(text, (c) => ({ codePoint: c.codePointAt(0) ?? 0, width: 1 })),
		alignRight,
	);
	if (!row) throw new Error("no RTL in row");
	return row;
}

/** Visual cells for a logical string, as the patched renderer hands them over. */
function visualCells(
	text: string,
	styleAt: (i: number) => TextStyle = () => plain,
) {
	const chars = [...text];
	const row = rowOf(text);
	const cells: OverlayCell[] = [];
	for (let x = 0; x < chars.length; x++) {
		const logical = row.order[x];
		cells.push({
			ch: chars[logical],
			rtl: row.levels[logical] % 2 === 1,
			style: styleAt(logical),
		});
	}
	return { row, cells };
}

describe("layoutRow", () => {
	test("a Hebrew row is one segment in logical order, anchored at its right edge", () => {
		const { row, cells } = visualCells("שתי הבעיות      ");
		expect(row.rtl).toBe(true);
		const layout = layoutRow(cells);
		expect(layout?.segments.map((s) => s.text)).toEqual(["שתי הבעיות"]);
		expect(layout?.right).toBe(15);
	});

	test("an English run inside a Hebrew row is its own left-to-right segment", () => {
		const { cells } = visualCells("לסגור עם Cmd ולפתוח");
		const segments = layoutRow(cells)?.segments ?? [];
		expect(segments.map((s) => [s.text.trim(), s.rtl])).toEqual([
			["לסגור עם", true],
			["Cmd", false],
			["ולפתוח", true],
		]);
		// the space between "Cmd" and the next word is drawn exactly once
		expect(segments.map((s) => s.text).join("").length).toBe(
			"לסגור עם Cmd ולפתוח".length,
		);
	});

	test("a style change starts a new segment; spaces stay with the text before them", () => {
		const { cells } = visualCells("מה לעשות: לסגור", (i) =>
			i < 9 ? bold : plain,
		);
		const segments = layoutRow(cells)?.segments ?? [];
		expect(segments.map((s) => [s.text, s.style.bold])).toEqual([
			["מה לעשות: ", true],
			["לסגור", false],
		]);
	});

	test("numbers keep their digit order", () => {
		const { cells } = visualCells("היום ב-15:27 סופרסט");
		const texts = layoutRow(cells)?.segments.map((s) => s.text) ?? [];
		expect(texts.join("|")).toContain("15:27");
	});

	test("an empty row lays out nothing", () => {
		expect(
			layoutRow([undefined, { ch: " ", rtl: true, style: plain }]),
		).toBeNull();
	});
});

describe("claimRow", () => {
	const line = (fg = 0) => ({ getFg: () => fg });
	const claim = (
		row: OverlayRow | null,
		opts: { cursorRow?: boolean; enabled?: boolean; fg?: number } = {},
	) =>
		claimRow(
			{},
			row,
			line(opts.fg),
			row?.order.length ?? 0,
			0,
			opts.cursorRow ?? false,
			opts.enabled ?? true,
		);

	test("claims a right-to-left row", () => {
		const row = rowOf("שלום עולם");
		claim(row);
		expect(row.hide).toBe(true);
	});

	test("leaves the cursor row, inverse rows and LTR paragraphs in cells", () => {
		const cursorRow = rowOf("שלום עולם");
		claim(cursorRow, { cursorRow: true });
		const inverse = rowOf("שלום עולם");
		claim(inverse, { fg: 0x4000000 });
		const ltr = rowOf("שלום עולם", false);
		claim(ltr);
		const mixed = rowOf("echo שלום");
		claim(mixed);
		for (const row of [cursorRow, inverse, ltr, mixed]) {
			expect(row.hide).toBeUndefined();
		}
	});

	test("does nothing while the feature is off", () => {
		const row = rowOf("שלום עולם");
		claim(row, { enabled: false });
		expect(row.hide).toBeUndefined();
	});
});

describe("takeCell", () => {
	const cellData = (ch: string): OverlayCellData => ({
		content: ch.codePointAt(0) ?? 0,
		getChars: () => ch,
		getFgColorMode: () => 0,
		getFgColor: () => 0,
		isBold: () => 0,
		isItalic: () => 0,
		isDim: () => 0,
		isInvisible: () => 0,
	});

	test("records the glyph and blanks the cell", () => {
		const row = rowOf("שלום");
		claimRow({}, row, {}, 4, 0, false, true);
		const cell = cellData("ש");
		takeCell(row, 3, cell);
		expect(row.cells?.[3]?.ch).toBe("ש");
		expect(row.cells?.[3]?.rtl).toBe(true);
		expect(cell.content & 0x1fffff).toBe(0x20);
	});

	test("keeps the glyph when the cell can't be read", () => {
		const row = rowOf("שלום");
		claimRow({}, row, {}, 4, 0, false, true);
		const cell = cellData("ש");
		cell.getChars = () => {
			throw new Error("broken cell");
		};
		takeCell(row, 3, cell);
		expect(cell.content).toBe("ש".codePointAt(0) ?? -1);
	});
});
