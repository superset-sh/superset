import { describe, expect, test } from "bun:test";
import { getNumberSeparators } from "@superset/i18n/format";
import { CFB, utils, type WorkSheet, write } from "xlsx";
import {
	openWorkbook,
	presentIndexes,
	UnreadableWorkbookError,
	unreadableReason,
} from "./workbookModel";

const EN = { group: ",", decimal: "." };
const FR = getNumberSeparators("fr");
const ALL = { rowStart: 0, rowEnd: 1_048_576, colStart: 0, colEnd: 16_384 };

function toXlsx(...sheets: Array<[string, WorkSheet]>): Uint8Array {
	const book = utils.book_new();
	for (const [name, sheet] of sheets)
		utils.book_append_sheet(book, sheet, name);
	return new Uint8Array(write(book, { type: "array", bookType: "xlsx" }));
}

function buildWorkbook(): Uint8Array {
	const sales = utils.aoa_to_sheet([
		["Mois", "CA"],
		["Janvier", 5200],
		["Février", 7280],
	]);
	sales.B2.z = "#,##0.00";
	sales.A4 = { t: "s", v: "Total" };
	sales.B4 = { t: "n", v: 12480, f: "SUM(B2:B3)" };
	sales["!ref"] = "A1:B4";
	sales["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
	return toXlsx(["Ventes", sales], ["Clients", utils.aoa_to_sheet([["Nom"]])]);
}

function withSheetXml(
	bytes: Uint8Array,
	path: string,
	edit: (xml: string) => string,
): Uint8Array {
	const zip = CFB.read(bytes, { type: "array" });
	const entry = CFB.find(zip, path);
	if (!entry) throw new Error(`missing ${path}`);
	entry.content = new TextEncoder().encode(
		edit(new TextDecoder().decode(entry.content as Uint8Array)),
	);
	return new Uint8Array(CFB.write(zip, { fileType: "zip", type: "array" }));
}

const text = (source: string, fileName = "a.csv") =>
	openWorkbook({ kind: "text", fileName, text: source });

test("iterates populated sparse array indexes lazily", () => {
	const entries: string[] = [];
	entries[3] = "a";
	entries[10_000] = "b";
	const indexes = presentIndexes(entries);
	expect(Array.isArray(indexes)).toBe(false);
	expect([...indexes]).toEqual([3, 10_000]);
});

describe("openWorkbook", () => {
	test("reads a semicolon CSV with quotes and a BOM, keeping the text as written", () => {
		const model = text(
			'﻿Mois;CA\n"Jan; vier";5200,50\n"dit ""ok""";01234\n',
			"ventes.csv",
		);
		expect(model.sheets).toHaveLength(1);
		expect(model.sheets[0]).toMatchObject({ rowCount: 3, colCount: 2 });
		const rows = model.getCells(0, ALL, FR);
		expect(rows[0]?.[0]?.text).toBe("Mois");
		expect(rows[1]?.[0]).toEqual({ text: "Jan; vier", kind: "text" });
		expect(rows[1]?.[1]).toEqual({ text: "5200,50", kind: "number" });
		expect(rows[2]?.[0]?.text).toBe('dit "ok"');
		expect(rows[2]?.[1]?.text).toBe("01234");
	});

	test("a .tsv file is split on tabs only", () => {
		const model = text("John\t12 Main St, New York, USA\n", "people.tsv");
		expect(model.sheets[0]).toMatchObject({ rowCount: 1, colCount: 2 });
		expect(model.getCells(0, ALL, EN)[0]?.[1]?.text).toBe(
			"12 Main St, New York, USA",
		);
	});

	test("delimited text is never sniffed as HTML, XML or SYLK", () => {
		const html = text("<table><tr><td>A</td></tr></table>,other\nfoo,bar\n");
		expect(html.sheets[0]).toMatchObject({ rowCount: 2, colCount: 2 });
		expect(html.getCells(0, ALL, EN)[0]?.[0]?.text).toBe(
			"<table><tr><td>A</td></tr></table>",
		);
		expect(text("<div>name</div>,age\nJoe,42\n").sheets[0]).toMatchObject({
			rowCount: 2,
			colCount: 2,
		});
		expect(text("ID;Name\n1;Bob\n").getCells(0, ALL, EN)[1]?.[1]?.text).toBe(
			"Bob",
		);
	});

	test("reads an xlsx with formulas, formatted numbers, merges and two sheets", () => {
		const model = openWorkbook({
			kind: "bytes",
			fileName: "ventes.xlsx",
			bytes: buildWorkbook(),
		});
		expect(model.sheets.map((sheet) => sheet.name)).toEqual([
			"Ventes",
			"Clients",
		]);
		expect(model.sheets[0]).toMatchObject({
			rowCount: 4,
			colCount: 2,
			merges: [{ top: 0, left: 0, bottom: 0, right: 1 }],
			frozen: { rows: 0, cols: 0 },
		});
		const rows = model.getCells(0, ALL, EN);
		expect(rows[1]?.[1]).toEqual({
			text: "5,200.00",
			kind: "number",
			value: "5200",
		});
		expect(rows[3]?.[1]).toEqual({
			text: "12480",
			kind: "number",
			formula: "=SUM(B2:B3)",
		});
		expect(model.getCells(1, ALL, EN)[0]?.[0]?.text).toBe("Nom");
	});

	test("cells holding a formula without a cached value count in the dimensions", () => {
		const sheet: WorkSheet = {
			A1: { t: "s", v: "Header" },
			B2: { t: "n", f: "1+1" } as WorkSheet[string],
			"!ref": "A1:B2",
		};
		const model = openWorkbook({
			kind: "bytes",
			fileName: "f.xlsx",
			bytes: toXlsx(["S", sheet]),
		});
		expect(model.sheets[0]).toMatchObject({ rowCount: 2, colCount: 2 });
		expect(model.getCells(0, ALL, EN)[1]?.[1]?.formula).toBe("=1+1");
	});

	test("numbers take the separators of the active language and keep the file format", () => {
		const sheet = utils.aoa_to_sheet([
			[51286.75, 0.125, 45000],
			[1234.5, "1.5"],
		]);
		sheet.A1.z = '#,##0.00 "€"';
		sheet.B1.z = "0.0%";
		sheet.C1.z = "yyyy-mm-dd";
		const bytes = toXlsx(["S", sheet]);
		const model = openWorkbook({ kind: "bytes", fileName: "n.xlsx", bytes });

		const fr = model.getCells(0, ALL, FR);
		expect(fr[0]?.[0]).toEqual({
			text: `51${FR.group}286,75 €`,
			kind: "number",
			value: "51286,75",
		});
		expect(fr[0]?.[1]?.text).toBe("12,5%");
		expect(fr[0]?.[2]?.text).toBe("2023-03-15");
		expect(fr[1]?.[0]?.text).toBe("1234,5");
		expect(fr[1]?.[1]?.text).toBe("1.5");

		const en = model.getCells(0, ALL, EN);
		expect(en[0]?.[0]?.text).toBe("51,286.75 €");
		expect(en[1]?.[0]?.text).toBe("1234.5");
		expect(model.search(0, "286,75", false, 10, FR).matches).toEqual([0, 0]);
	});

	test("separators change in the number only, never in the text of its format", () => {
		const sheet = utils.aoa_to_sheet([[5200.5, 5200.5, 5200.5]]);
		sheet.A1.z = '0.00 "kg (d.2024)"';
		sheet.B1.z = "0.00\\ \\d\\.\\2";
		sheet.C1.z = '#,##0.0 "1,5"';
		const model = openWorkbook({
			kind: "bytes",
			fileName: "l.xlsx",
			bytes: toXlsx(["S", sheet]),
		});
		const fr = model.getCells(0, ALL, FR)[0];
		expect(fr?.[0]?.text).toBe("5200,50 kg (d.2024)");
		expect(fr?.[1]?.text).toBe("5200,50 d.2");
		expect(fr?.[2]?.text).toBe(`5${FR.group}200,5 1,5`);
		expect(model.getCells(0, ALL, EN)[0]?.[0]?.text).toBe(
			"5200.50 kg (d.2024)",
		);
	});

	test("delimited text stays as written whatever the language", () => {
		const model = text("1.5,2\n");
		expect(model.getCells(0, ALL, FR)[0]?.[0]?.text).toBe("1.5");
	});

	test("reads frozen panes from the sheet view, and freezes the header row of delimited text", () => {
		const bytes = withSheetXml(
			toXlsx(
				["Plain", utils.aoa_to_sheet([["a"]])],
				[
					"Frozen",
					utils.aoa_to_sheet([
						["a", "b"],
						[1, 2],
						[3, 4],
					]),
				],
			),
			"/xl/worksheets/sheet2.xml",
			(xml) =>
				xml.replace(
					/<sheetView\b[^>]*\/>/,
					'<sheetView workbookViewId="0"><pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/></sheetView>',
				),
		);
		const model = openWorkbook({ kind: "bytes", fileName: "p.xlsx", bytes });
		expect(model.sheets.map((sheet) => sheet.frozen)).toEqual([
			{ rows: 0, cols: 0 },
			{ rows: 2, cols: 1 },
		]);
		expect(text("a,b\n1,2\n").sheets[0]?.frozen).toEqual({ rows: 1, cols: 0 });
	});

	test("serves a window of columns, never the whole width of a row", () => {
		const sheet: WorkSheet = {
			A1: { t: "s", v: "a" },
			XFD1: { t: "s", v: "z" },
			"!ref": "A1:XFD1",
		};
		const model = openWorkbook({
			kind: "bytes",
			fileName: "w.xlsx",
			bytes: toXlsx(["S", sheet]),
		});
		expect(model.sheets[0]?.colCount).toBe(16_384);
		const left = model.getCells(
			0,
			{ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 64 },
			EN,
		);
		expect(left[0]?.length).toBeLessThanOrEqual(64);
		expect(left[0]?.[0]?.text).toBe("a");
		const right = model.getCells(
			0,
			{ rowStart: 0, rowEnd: 1, colStart: 16_380, colEnd: 16_384 },
			EN,
		);
		expect(right[0]?.[3]?.text).toBe("z");
	});

	test("finds matches in reading order and copies a range as TSV", () => {
		const model = text("pomme,Poire\nraisin,pomme verte\n");
		expect(model.search(0, "POMME", false, 10, EN).matches).toEqual([
			0, 0, 1, 1,
		]);
		expect(model.search(0, "POMME", true, 10, EN).matches).toEqual([]);
		expect(model.search(0, "pomme", false, 1, EN)).toEqual({
			matches: [0, 0],
			truncated: true,
		});
		expect(
			model.rangeToTsv(0, { top: 0, left: 1, bottom: 1, right: 2 }, EN),
		).toMatchObject({ text: "Poire\npomme verte", truncated: false });
		expect(
			model.rangeToTsv(0, { top: 0, left: 0, bottom: 1, right: 0 }, EN),
		).toMatchObject({ text: "pomme\nraisin", truncated: false });
	});

	test("copy keeps the selected rectangle, empty cells included", () => {
		const model = text("x,,\n1,2,3\n");
		expect(
			model.rangeToTsv(0, { top: 0, left: 0, bottom: 0, right: 2 }, EN),
		).toEqual({ text: "x\t\t", cells: 3, truncated: false });
		expect(
			model.rangeToTsv(0, { top: 0, left: 1, bottom: 1, right: 2 }, EN),
		).toEqual({ text: "\t\n2\t3", cells: 4, truncated: false });
		expect(
			text('a\tb,"say ""hi""",two\nlines\n').rangeToTsv(
				0,
				{ top: 0, left: 0, bottom: 0, right: 2 },
				EN,
			).text,
		).toBe('"a\tb"\t"say ""hi"""\ttwo');
	});

	test("copy of a huge selection stops at the cell bound without walking the rest", () => {
		// SheetJS writes every cell of !ref, so the far corner is patched in.
		const bytes = withSheetXml(
			toXlsx(["S", utils.aoa_to_sheet([["a"], [null, "z"]])]),
			"/xl/worksheets/sheet1.xml",
			(xml) =>
				xml
					.replace(/<dimension ref="[^"]*"/, '<dimension ref="A1:XFD1048576"')
					.replace('<row r="2"', '<row r="1048576"')
					.replace('r="B2"', 'r="XFD1048576"'),
		);
		const model = openWorkbook({ kind: "bytes", fileName: "s.xlsx", bytes });
		expect(model.sheets[0]).toMatchObject({
			rowCount: 1_048_576,
			colCount: 16_384,
		});
		const all = { top: 0, left: 0, bottom: 1_048_575, right: 16_383 };
		expect(
			model.rangeToTsv(0, all, EN, { maxCells: 3, maxChars: 1000 }),
		).toEqual({ text: "a\t\t", cells: 3, truncated: true });
		expect(model.rangeToTsv(0, all, EN)).toMatchObject({
			cells: 1_000_000,
			truncated: true,
		});
	});

	test("copy stops at the cell and size bounds", () => {
		const model = text("a,b,c\nd,e,f\ng,h,i\n");
		const all = { top: 0, left: 0, bottom: 2, right: 2 };
		expect(
			model.rangeToTsv(0, all, EN, { maxCells: 4, maxChars: 1000 }),
		).toEqual({ text: "a\tb\tc\nd", cells: 4, truncated: true });
		expect(
			model.rangeToTsv(0, all, EN, { maxCells: 100, maxChars: 7 }),
		).toEqual({ text: "a\tb\tc\nd", cells: 4, truncated: true });
	});

	test("rejects a workbook whose bytes are not an archive", () => {
		expect(() =>
			openWorkbook({
				kind: "bytes",
				fileName: "broken.xlsx",
				bytes: new TextEncoder().encode("not a workbook"),
			}),
		).toThrow(UnreadableWorkbookError);
	});

	test("an empty CSV has no rows", () => {
		expect(text("").sheets[0]).toMatchObject({ rowCount: 0, colCount: 0 });
	});

	test("delimited dimensions count fields and records, empty ones included", () => {
		expect(text("a,b,\n").sheets[0]).toMatchObject({
			rowCount: 1,
			colCount: 3,
		});
		expect(text("a,,").sheets[0]).toMatchObject({ rowCount: 1, colCount: 3 });
		expect(text("a\n\n\n").sheets[0]).toMatchObject({
			rowCount: 3,
			colCount: 1,
		});
	});

	test("a password-protected Office file says so, and a legacy .xls still opens", () => {
		const container = CFB.utils.cfb_new();
		CFB.utils.cfb_add(container, "EncryptionInfo", new Uint8Array(64));
		CFB.utils.cfb_add(container, "EncryptedPackage", new Uint8Array(64));
		const encrypted = new Uint8Array(
			CFB.write(container, { fileType: "cfb", type: "array" }),
		);
		for (const fileName of ["locked.xlsx", "locked.xlsm", "locked.xlsb"]) {
			let error: unknown;
			try {
				openWorkbook({ kind: "bytes", fileName, bytes: encrypted });
			} catch (caught) {
				error = caught;
			}
			expect(unreadableReason(error)).toBe("password");
		}

		const book = utils.book_new();
		utils.book_append_sheet(book, utils.aoa_to_sheet([["legacy"]]), "S");
		const xls = new Uint8Array(write(book, { type: "array", bookType: "xls" }));
		for (const fileName of ["old.xls", "renamed.xlsx"]) {
			const model = openWorkbook({ kind: "bytes", fileName, bytes: xls });
			expect(model.getCells(0, ALL, EN)[0]?.[0]?.text).toBe("legacy");
		}
	});

	test("reads frozen panes of an OpenDocument sheet from its settings", () => {
		const book = utils.book_new();
		utils.book_append_sheet(book, utils.aoa_to_sheet([["a"]]), "Plain");
		utils.book_append_sheet(
			book,
			utils.aoa_to_sheet([
				["a", "b", "c"],
				[1, 2, 3],
				[4, 5, 6],
			]),
			"Gel & co",
		);
		const zip = CFB.read(
			new Uint8Array(write(book, { type: "array", bookType: "ods" })),
			{ type: "array" },
		);
		const item = (name: string, value: number) =>
			`<config:config-item config:name='${name}' config:type="int">${value}</config:config-item>`;
		CFB.utils.cfb_add(
			zip,
			"settings.xml",
			new TextEncoder().encode(
				`<office:document-settings><office:settings><config:config-item-set config:name="ooo:view-settings"><config:config-item-map-indexed config:name="Views"><config:config-item-map-entry><config:config-item-map-named config:name="Tables"><config:config-item-map-entry config:name="Plain">${item("HorizontalSplitMode", 1)}${item("HorizontalSplitPosition", 300)}</config:config-item-map-entry><config:config-item-map-entry config:name="Gel &amp; co">${item("HorizontalSplitMode", 2)}${item("HorizontalSplitPosition", 1)}${item("VerticalSplitMode", 2)}${item("VerticalSplitPosition", 2)}</config:config-item-map-entry></config:config-item-map-named></config:config-item-map-entry></config:config-item-map-indexed></config:config-item-set></office:settings></office:document-settings>`,
			),
		);
		const bytes = new Uint8Array(
			CFB.write(zip, { fileType: "zip", type: "array" }),
		);
		const model = openWorkbook({ kind: "bytes", fileName: "p.ods", bytes });
		expect(model.sheets.map((sheet) => sheet.frozen)).toEqual([
			{ rows: 0, cols: 0 },
			{ rows: 2, cols: 1 },
		]);
	});
});
