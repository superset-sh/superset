import { describe, expect, it } from "bun:test";
import { getSchema } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { BulletList } from "@tiptap/extension-bullet-list";
import { Document } from "@tiptap/extension-document";
import { ListItem } from "@tiptap/extension-list-item";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { Text } from "@tiptap/extension-text";
import {
	defaultMarkdownSerializer,
	MarkdownSerializer,
} from "@tiptap/pm/markdown";
import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import {
	serializeMarkdownTable,
	serializeSelectionForClipboard,
} from "./serializeMarkdownTable";

// Build the real schema so node names match production exactly
// (table / tableRow / tableHeader / tableCell). getSchema does not touch the DOM.
const schema = getSchema([
	Document,
	Text,
	Paragraph,
	Bold,
	BulletList,
	ListItem,
	Table,
	TableRow,
	TableHeader,
	TableCell,
]);

// serializeMarkdownTable renders descendants itself, so the nodes map only needs
// `table` plus `text` (inline leaves are dispatched through the nodes map). In
// the real app tiptap-markdown supplies the full map. `bold` maps to
// prosemirror-markdown's `strong` serializer, the same one used for the Bold mark.
const serializer = new MarkdownSerializer(
	{
		table: serializeMarkdownTable,
		text: defaultMarkdownSerializer.nodes.text,
		paragraph: defaultMarkdownSerializer.nodes.paragraph,
		bulletList: defaultMarkdownSerializer.nodes.bullet_list,
		listItem: defaultMarkdownSerializer.nodes.list_item,
	},
	{ bold: defaultMarkdownSerializer.marks.strong },
);

const paragraph = (content?: ProseMirrorNode) =>
	schema.nodes.paragraph.create(null, content);
const th = (text?: string) =>
	schema.nodes.tableHeader.create(
		null,
		paragraph(text ? schema.text(text) : undefined),
	);
const cell = (text?: string) =>
	schema.nodes.tableCell.create(
		null,
		paragraph(text ? schema.text(text) : undefined),
	);
const row = (cells: ProseMirrorNode[]) =>
	schema.nodes.tableRow.create(null, cells);
const toMarkdown = (table: ProseMirrorNode) =>
	serializer.serialize(schema.nodes.doc.create(null, table));

describe("serializeMarkdownTable", () => {
	it("serializes a header + body table to GFM (never [table])", () => {
		const md = toMarkdown(
			schema.nodes.table.create(null, [
				row([th("a"), th("b")]),
				row([cell("c"), cell("d")]),
			]),
		);

		expect(md).toBe("| a | b |\n| --- | --- |\n| c | d |");
		expect(md).not.toContain("[table]");
	});

	it("synthesizes an empty header for a headerless / partial cell selection", () => {
		// This is the reported bug: a CellSelection copy of body cells has no
		// header row, which made tiptap-markdown fall back to `[table]`.
		const md = toMarkdown(
			schema.nodes.table.create(null, [row([cell("c"), cell("d")])]),
		);

		expect(md).toBe("|  |  |\n| --- | --- |\n| c | d |");
		expect(md).not.toContain("[table]");
	});

	it("escapes pipes and renders empty cells", () => {
		const md = toMarkdown(
			schema.nodes.table.create(null, [
				row([th("a"), th("b")]),
				row([cell("x|y"), cell()]),
			]),
		);

		expect(md).toContain("| x\\|y |  |");
		expect(md).not.toContain("[table]");
	});

	it("pads ragged rows to the widest row", () => {
		const md = toMarkdown(
			schema.nodes.table.create(null, [
				row([th("a"), th("b"), th("c")]),
				row([cell("c")]),
			]),
		);

		expect(md).toContain("| c |  |  |");
	});

	it("keeps inline marks inside cells", () => {
		const boldCell = schema.nodes.tableCell.create(
			null,
			paragraph(schema.text("bold", [schema.marks.bold.create()])),
		);
		const md = toMarkdown(
			schema.nodes.table.create(null, [row([th("h")]), row([boldCell])]),
		);

		expect(md).toContain("**bold**");
		expect(md).not.toContain("[table]");
	});

	it("preserves internal whitespace (meaningful inside code spans)", () => {
		const md = toMarkdown(
			schema.nodes.table.create(null, [row([th("a")]), row([cell("x  y")])]),
		);

		expect(md).toContain("| x  y |");
	});

	it("does not treat a mixed header/body first row as a header", () => {
		const md = toMarkdown(
			schema.nodes.table.create(null, [
				row([th("a"), cell("b")]),
				row([cell("c"), cell("d")]),
			]),
		);

		expect(md).toBe("|  |  |\n| --- | --- |\n| a | b |\n| c | d |");
	});

	it("joins multiple blocks in a cell with a space", () => {
		const multiCell = schema.nodes.tableCell.create(null, [
			paragraph(schema.text("a")),
			paragraph(schema.text("b")),
		]);
		const md = toMarkdown(
			schema.nodes.table.create(null, [row([th("h")]), row([multiCell])]),
		);

		expect(md).toContain("| a b |");
	});

	it("flattens block-level cell content (a list) onto the cell line", () => {
		const listCell = schema.nodes.tableCell.create(
			null,
			schema.nodes.bulletList.create(null, [
				schema.nodes.listItem.create(null, paragraph(schema.text("one"))),
				schema.nodes.listItem.create(null, paragraph(schema.text("two"))),
			]),
		);
		const md = toMarkdown(
			schema.nodes.table.create(null, [row([th("h")]), row([listCell])]),
		);

		expect(md).not.toContain("[table]");
		expect(md).toContain("one");
		expect(md).toContain("two");
	});
});

describe("serializeSelectionForClipboard", () => {
	const serializeMarkdown = (content: Fragment) =>
		serializer.serialize(schema.nodes.doc.create(null, content));

	const testDoc = schema.nodes.doc.create(null, [
		schema.nodes.table.create(null, [
			row([th("Check"), th("Status")]),
			row([cell("lint"), cell("pass/fail")]),
		]),
		schema.nodes.paragraph.create(
			null,
			schema.text("hi", [schema.marks.bold.create()]),
		),
	]);

	const headerPositions: number[] = [];
	const cellPositions: number[] = [];
	let passFrom = -1;
	let passTo = -1;
	let boldFrom = -1;
	let boldTo = -1;
	testDoc.descendants((node, pos) => {
		if (node.type.name === "tableHeader") headerPositions.push(pos);
		if (node.type.name === "tableCell") cellPositions.push(pos);
		if (node.isText && node.text === "pass/fail") {
			passFrom = pos;
			passTo = pos + node.text.length;
		}
		if (node.isText && node.text === "hi") {
			boldFrom = pos;
			boldTo = pos + node.text.length;
		}
		return true;
	});
	const lastCell = cellPositions[cellPositions.length - 1] ?? 0;

	it("serializes a whole-table CellSelection as a GFM table", () => {
		const selection = CellSelection.create(
			testDoc,
			headerPositions[0] ?? 0,
			lastCell,
		);
		const result = serializeSelectionForClipboard(
			selection,
			selection.content(),
			serializeMarkdown,
		);

		expect(result).toContain("| Check | Status |");
		expect(result).toContain("| lint | pass/fail |");
	});

	it("copies a single-cell CellSelection as plain text", () => {
		const selection = CellSelection.create(testDoc, lastCell, lastCell);
		const result = serializeSelectionForClipboard(
			selection,
			selection.content(),
			serializeMarkdown,
		);

		expect(result).toBe("pass/fail");
		expect(result).not.toContain("|");
	});

	it("copies text selected inside a cell as plain text, not a table", () => {
		const selection = TextSelection.create(testDoc, passFrom, passTo);
		const result = serializeSelectionForClipboard(
			selection,
			selection.content(),
			serializeMarkdown,
		);

		expect(result).toBe("pass/fail");
		expect(result).not.toContain("|");
	});

	it("keeps markdown for a selection outside any table", () => {
		const selection = TextSelection.create(testDoc, boldFrom, boldTo);
		const result = serializeSelectionForClipboard(
			selection,
			selection.content(),
			serializeMarkdown,
		);

		expect(result).toContain("**hi**");
	});

	it("copies a selection crossing the table boundary as plain text", () => {
		// Starts outside the table and ends inside it: classified by $to, so it
		// must not emit a partial table.
		const doc = schema.nodes.doc.create(null, [
			schema.nodes.paragraph.create(null, schema.text("before")),
			schema.nodes.table.create(null, [
				row([th("Check"), th("Status")]),
				row([cell("lint"), cell("pass/fail")]),
			]),
		]);
		let outsidePos = -1;
		let insidePos = -1;
		doc.descendants((node, pos) => {
			if (node.isText && node.text === "before") outsidePos = pos + 1;
			if (node.isText && node.text === "Check") insidePos = pos + 1;
			return true;
		});

		const selection = TextSelection.create(doc, outsidePos, insidePos);
		const result = serializeSelectionForClipboard(
			selection,
			selection.content(),
			serializeMarkdown,
		);

		expect(result).not.toContain("|");
	});
});
