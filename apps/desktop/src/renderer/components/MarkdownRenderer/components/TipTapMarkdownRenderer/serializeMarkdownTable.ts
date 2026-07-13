import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * GFM markdown serializer for TipTap table nodes.
 *
 * `tiptap-markdown@0.9.0` ships its own `table` serializer, but it bails to the
 * raw-HTML fallback (which, with `html: false`, writes the literal `[table]`)
 * whenever the table isn't a "clean" header+body GFM table — specifically when
 * the first row isn't entirely `tableHeader` cells, or a cell holds more than
 * one child node. That is exactly what a ProseMirror `CellSelection` copy of
 * *body* cells produces, so copying content inside a rendered table put
 * `[table]` on the clipboard.
 *
 * We register these serializers via each table node extension's
 * `storage.markdown.serialize`. `tiptap-markdown` merges an extension's own
 * markdown spec over its built-in one, so these override the strict defaults for
 * both clipboard copy (`transformCopiedText`) and `getMarkdown()` (save).
 */

/**
 * prosemirror-markdown's serializer state exposes `out`/`closed` at runtime (its
 * own serializers and `serialize()` read them) but does not declare them on the
 * public type. We snapshot and restore them so a single cell's inline content
 * can be rendered into an isolated buffer without leaking into the outer output.
 */
interface SerializerStateInternals {
	out: string;
	closed: ProseMirrorNode | null;
}

/**
 * Render one table cell's content to a single-line markdown string.
 *
 * GFM cells must stay on one physical line, so hard breaks / newlines are
 * collapsed to spaces and `|` is escaped so cell content can't split the row.
 */
export function renderTableCellContent(
	state: MarkdownSerializerState,
	cell: ProseMirrorNode,
): string {
	const internals = state as unknown as SerializerStateInternals;
	const previousOut = internals.out;
	const previousClosed = internals.closed;
	// Render into a clean buffer and don't let the outer pending block-close flush
	// into the cell; both are restored before the table's own output is written.
	internals.out = "";
	internals.closed = null;

	cell.forEach((block, _offset, index) => {
		// A cell is `block+`; the common case is a single paragraph. Join multiple
		// blocks with a space to keep the cell on one line.
		if (index > 0) {
			internals.out += " ";
		}
		if (block.isTextblock) {
			state.renderInline(block);
		} else {
			state.render(block, cell, index);
		}
	});

	const rendered = internals.out;
	internals.out = previousOut;
	internals.closed = previousClosed;

	return rendered
		.replace(/\\\r?\n/g, " ") // prosemirror hard break ("\\\n") -> space
		.replace(/\r?\n/g, " ") // any remaining newline -> space
		.replace(/\|/g, "\\|") // escape pipes so they don't split the cell
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Serialize a `table` node to a GitHub-flavored markdown table. Called by
 * `tiptap-markdown` as `(state, node) => void` via `storage.markdown.serialize`.
 */
export function serializeMarkdownTable(
	state: MarkdownSerializerState,
	node: ProseMirrorNode,
): void {
	const rows: Array<{ cells: string[]; isHeader: boolean }> = [];

	node.forEach((rowNode) => {
		const cells: string[] = [];
		let isHeader = false;
		rowNode.forEach((cellNode) => {
			if (cellNode.type.name === "tableHeader") {
				isHeader = true;
			}
			cells.push(renderTableCellContent(state, cellNode));
		});
		rows.push({ cells, isHeader });
	});

	if (rows.length === 0) {
		state.closeBlock(node);
		return;
	}

	const columnCount = rows.reduce(
		(max, row) => Math.max(max, row.cells.length),
		0,
	);

	const formatRow = (cells: string[]): string => {
		const padded = cells.slice();
		while (padded.length < columnCount) {
			padded.push("");
		}
		return `| ${padded.join(" | ")} |`;
	};

	const lines: string[] = [];
	let bodyStart = 0;

	if (rows[0]?.isHeader) {
		lines.push(formatRow(rows[0].cells));
		bodyStart = 1;
	} else {
		// GFM requires a header + delimiter row. When the (possibly partial)
		// selection has no header row, emit an empty header and keep every row as
		// a body row — no data is lost.
		lines.push(formatRow([]));
	}

	lines.push(
		`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
	);

	for (let i = bodyStart; i < rows.length; i += 1) {
		const row = rows[i];
		if (row) {
			lines.push(formatRow(row.cells));
		}
	}

	lines.forEach((line, index) => {
		if (index > 0) {
			state.ensureNewLine();
		}
		state.write(line);
	});

	state.closeBlock(node);
}

/**
 * Defense-in-depth serializer for `tableRow`/`tableHeader`/`tableCell`. These are
 * never reached in the normal document or CellSelection path (serializeMarkdownTable
 * renders all descendants itself), but registering them guarantees a stray render
 * can never emit `[tableRow]` / `[tableCell]`.
 */
export function serializeTableChild(
	state: MarkdownSerializerState,
	node: ProseMirrorNode,
): void {
	state.renderContent(node);
}
