import { expect, test } from "bun:test";
import {
	parseFrozenPane,
	parseOpenDocumentFrozenPanes,
	readFrozenPanes,
} from "./frozenPanes";

test("reads frozen rows and columns from the first sheet view only", () => {
	expect(
		parseFrozenPane(
			'<x:sheetViews><x:sheetView tabSelected="1"><x:pane xSplit="2" ySplit="1" topLeftCell="C2" state="frozenSplit"/></x:sheetView><x:sheetView><x:pane ySplit="9" state="frozen"/></x:sheetView></x:sheetViews>',
		),
	).toEqual({ rows: 1, cols: 2 });
	expect(
		parseFrozenPane(
			'<sheetViews><sheetView><pane xSplit="2400" ySplit="1200" state="split"/></sheetView></sheetViews>',
		),
	).toEqual({ rows: 0, cols: 0 });
	expect(
		parseFrozenPane('<sheetViews><sheetView workbookViewId="0"/></sheetViews>'),
	).toEqual({
		rows: 0,
		cols: 0,
	});
});

test("accepts single-quoted attributes", () => {
	expect(
		parseFrozenPane(
			"<sheetView><pane xSplit='3' ySplit='1' state='frozen'/></sheetView>",
		),
	).toEqual({ rows: 1, cols: 3 });
});

const part = (xml: string) => ({ content: new TextEncoder().encode(xml) });
const FROZEN_SHEET = (rows: number) =>
	part(
		`<worksheet><sheetViews><sheetView><pane ySplit="${rows}" state="frozen"/></sheetView></sheetViews><sheetData/></worksheet>`,
	);

test("finds the workbook and its sheets through the package relationships", () => {
	expect(
		readFrozenPanes({
			"_rels/.rels": part(
				"<Relationships><Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='/book/main.xml'/></Relationships>",
			),
			"book/main.xml": part(
				'<workbook><sheets><sheet name="A" sheetId="1" r:id="rA"/><sheet name="B" sheetId="2" r:id="rB"/></sheets></workbook>',
			),
			"book/_rels/main.xml.rels": part(
				'<Relationships><Relationship Id="rA" Target="tabs/a.xml"/><Relationship Id="rB" Target="../shared/./b.xml"/></Relationships>',
			),
			"book/tabs/a.xml": FROZEN_SHEET(2),
			"shared/b.xml": FROZEN_SHEET(5),
		}),
	).toEqual([
		{ rows: 2, cols: 0 },
		{ rows: 5, cols: 0 },
	]);
});

test("skips the binary parts of an xlsb", () => {
	expect(
		readFrozenPanes({
			"_rels/.rels": part(
				'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.bin"/></Relationships>',
			),
			"xl/workbook.bin": { content: new Uint8Array([0x83, 0x01, 0x00]) },
		}),
	).toEqual([]);
});

test("reads OpenDocument frozen panes when attributes have space around equals", () => {
	const settings = `<config:config-item-map-named config:name = "Tables"><config:config-item-map-entry config:name = "Sheet1"><config:config-item config:name = "VerticalSplitMode">2</config:config-item><config:config-item config:name = "VerticalSplitPosition">3</config:config-item><config:config-item config:name = "HorizontalSplitMode">2</config:config-item><config:config-item config:name = "HorizontalSplitPosition">2</config:config-item></config:config-item-map-entry></config:config-item-map-named>`;
	expect(parseOpenDocumentFrozenPanes(settings, ["Sheet1"])).toEqual([
		{ rows: 3, cols: 2 },
	]);
});
