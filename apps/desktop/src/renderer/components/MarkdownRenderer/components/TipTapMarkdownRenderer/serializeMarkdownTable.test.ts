import { describe, expect, it } from "bun:test";
import { getSchema } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
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
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { serializeMarkdownTable } from "./serializeMarkdownTable";

// Build the real schema so node names match production exactly
// (table / tableRow / tableHeader / tableCell). getSchema does not touch the DOM.
const schema = getSchema([
	Document,
	Text,
	Paragraph,
	Bold,
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
});
