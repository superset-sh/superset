import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type {
	Fragment,
	Node as ProseMirrorNode,
	ResolvedPos,
	Slice,
} from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

/**
 * GFM markdown serialization for TipTap tables in the markdown preview.
 *
 * `tiptap-markdown@0.9.0` ships a `table` serializer that bails to a raw-HTML
 * fallback — which, with `html: false`, writes the literal `[table]` — whenever
 * a table isn't a clean header+body GFM table. `serializeMarkdownTable` replaces
 * it (registered via each table node's `storage.markdown.serialize`) so both
 * `getMarkdown()` (save) and a whole-table copy produce a real GFM table.
 *
 * `serializeSelectionForClipboard` then decides, per copied selection, whether
 * the clipboard text/plain is a GFM table (whole-table selection), plain text
 * (text within a cell / a subset of cells), or normal markdown (selection
 * outside any table).
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
function renderTableCellContent(
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

	// Newlines become spaces (GFM cells are single-line) and pipes are escaped.
	// Internal whitespace is left intact — it is meaningful inside code spans.
	return rendered
		.replace(/\\\r?\n/g, " ") // prosemirror hard break ("\\\n") -> space
		.replace(/\r?\n/g, " ") // any remaining newline -> space
		.replace(/\|/g, "\\|") // escape pipes so they don't split the cell
		.trim();
}

/**
 * A GFM header row is one whose cells are all `tableHeader`. A mixed or body row
 * (e.g. a partial selection that clips a row-header column) must not be treated
 * as a header, or its body cells get promoted to headers on round-trip.
 */
function isHeaderRow(row: ProseMirrorNode | null | undefined): boolean {
	if (!row || row.childCount === 0) {
		return false;
	}
	let allHeaderCells = true;
	row.forEach((cell) => {
		if (cell.type.name !== "tableHeader") {
			allHeaderCells = false;
		}
	});
	return allHeaderCells;
}

/**
 * Serialize a `table` node to a GitHub-flavored markdown table. Called by
 * `tiptap-markdown` as `(state, node) => void` via `storage.markdown.serialize`.
 */
export function serializeMarkdownTable(
	state: MarkdownSerializerState,
	node: ProseMirrorNode,
): void {
	const rows: string[][] = [];
	node.forEach((rowNode) => {
		const cells: string[] = [];
		rowNode.forEach((cellNode) => {
			cells.push(renderTableCellContent(state, cellNode));
		});
		rows.push(cells);
	});

	if (rows.length === 0) {
		state.closeBlock(node);
		return;
	}

	const columnCount = rows.reduce(
		(max, cells) => Math.max(max, cells.length),
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

	if (isHeaderRow(node.firstChild)) {
		lines.push(formatRow(rows[0] ?? []));
		bodyStart = 1;
	} else {
		// GFM requires a header + delimiter row. When the (possibly partial)
		// selection has no header row, emit an empty header and keep every row as a
		// body row — no data is lost.
		lines.push(formatRow([]));
	}

	lines.push(
		`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
	);

	for (let i = bodyStart; i < rows.length; i += 1) {
		const cells = rows[i];
		if (cells) {
			lines.push(formatRow(cells));
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

function isPosInsideTable($pos: ResolvedPos): boolean {
	for (let depth = $pos.depth; depth > 0; depth -= 1) {
		if ($pos.node(depth).type.name === "table") {
			return true;
		}
	}
	return false;
}

/** Flatten a copied slice to plain text, turning block boundaries into newlines. */
export function sliceToPlainText(slice: Slice): string {
	return slice.content.textBetween(0, slice.content.size, "\n");
}

/**
 * Decide the clipboard `text/plain` for a copied selection.
 *
 * A text selection *inside* a cell copies a slice whose fragment is wrapped in
 * an "open" `table` node (`doc.slice()` keeps the ancestor path). tiptap-markdown
 * ignores the open depths and renders that wrapper as a full GFM table, so
 * copying cell text produced a one-cell table on the clipboard. Decide by the
 * selection instead of the slice shape:
 *
 * - whole-table `CellSelection` -> GFM markdown table
 * - any other selection touching a table (partial cells, text within a cell, or
 *   a range crossing the table boundary) -> plain text
 * - selection outside any table -> normal markdown (preserves copy-as-markdown)
 */
export function serializeSelectionForClipboard(
	selection: Selection,
	slice: Slice,
	serializeMarkdown: (content: Fragment) => string,
): string {
	if (selection instanceof CellSelection) {
		const wholeTable = selection.isColSelection() && selection.isRowSelection();
		return wholeTable
			? serializeMarkdown(slice.content)
			: sliceToPlainText(slice);
	}

	if (isPosInsideTable(selection.$from) || isPosInsideTable(selection.$to)) {
		return sliceToPlainText(slice);
	}

	return serializeMarkdown(slice.content);
}
