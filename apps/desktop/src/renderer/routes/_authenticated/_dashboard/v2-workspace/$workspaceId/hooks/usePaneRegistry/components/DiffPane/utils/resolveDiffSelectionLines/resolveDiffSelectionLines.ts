import type { SelectionSide } from "@pierre/diffs";

// ponytail: this whole module reads @pierre/diffs ≥1.2.2 rendered-DOM internals.
// @pierre/diffs exposes no text-selection API, so we read the line markers it
// paints inside each <diffs-container> shadow root:
//   - every line row carries `data-line` (line number) + `data-line-type`
//     (context | change-addition | change-deletion)
//   - the side of a pure context line (which has no change-* type) is read from
//     its enclosing `<code data-additions>` / `<code data-deletions>` column.
// These are undocumented internals. Upstream request to expose a real selection
// API is github.com/pierredotco/diffs#248 (closed/completed). Re-verify the
// attribute names on any @pierre/diffs upgrade.

/** Minimal shape we need off a ShadowRoot — narrowed so the resolver is
 *  unit-testable against a hand-built fake without a real DOM. `getSelection`
 *  is non-standard (Chromium-only) and absent from lib.dom's ShadowRoot type. */
export interface DiffSelectionRoot {
	getSelection?: () => DiffSelectionLike | null;
}

interface DiffSelectionLike {
	rangeCount: number;
	getRangeAt(index: number): DiffSelectionRange;
}

/** Selection boundaries are usually text nodes inside a line; we only need to
 *  reach the nearest ancestor element, so we accept any node that can either
 *  `closest` itself or hand us a `parentElement` to climb to. */
interface DiffSelectionNode {
	closest?: (selectors: string) => DiffSelectionElement | null;
	parentElement?: DiffSelectionElement | null;
}

interface DiffSelectionElement {
	closest(selectors: string): DiffSelectionElement | null;
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
}

interface DiffSelectionRange {
	collapsed: boolean;
	startContainer: DiffSelectionNode;
	endContainer: DiffSelectionNode;
}

export interface ResolvedDiffSelection {
	start: number;
	end: number;
	side?: SelectionSide;
}

interface ResolvedLine {
	line: number;
	side?: SelectionSide;
}

function sideFromLineType(lineType: string | null): SelectionSide | undefined {
	if (lineType === "change-addition") return "additions";
	if (lineType === "change-deletion") return "deletions";
	return undefined;
}

/** Context lines carry no change-* type; their side is the column they sit in. */
function sideFromColumn(el: DiffSelectionElement): SelectionSide | undefined {
	const code = el.closest("[data-code]");
	if (!code) return undefined;
	// 1.2.2 marks the column with boolean `data-additions`/`data-deletions`.
	if (code.hasAttribute("data-additions")) return "additions";
	if (code.hasAttribute("data-deletions")) return "deletions";
	// Tolerate an older/future shape where the side is the `data-code` value.
	const dataCode = code.getAttribute("data-code");
	if (dataCode === "additions" || dataCode === "deletions") return dataCode;
	return undefined;
}

/** Walk up from a selection boundary node to the nearest `[data-line]` row and
 *  read its line number + side. Returns null if no line row is found or the
 *  `data-line` value isn't a number. */
function resolveLineFromNode(
	node: DiffSelectionNode | null,
): ResolvedLine | null {
	// Element nodes can `closest` from themselves; text nodes (the common case)
	// can't, so climb to the parent element first.
	const start =
		typeof node?.closest === "function" ? node : node?.parentElement;
	const el = start?.closest?.("[data-line]") ?? null;
	if (!el) return null;
	const line = Number(el.getAttribute("data-line"));
	if (!Number.isFinite(line)) return null;
	return {
		line,
		side:
			sideFromLineType(el.getAttribute("data-line-type")) ?? sideFromColumn(el),
	};
}

/**
 * Resolve the line range a user highlighted (selected text) inside a
 * @pierre/diffs `<diffs-container>` shadow root into the same
 * `{ start, end, side }` shape the gutter line-selection produces.
 *
 * Returns null when there is no usable selection (feature-missing,
 * collapsed/empty, or the boundaries aren't inside diff line rows).
 */
export function resolveDiffSelectionLines(
	root: DiffSelectionRoot | null | undefined,
): ResolvedDiffSelection | null {
	if (!root || typeof root.getSelection !== "function") return null;
	const selection = root.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (range.collapsed) return null;

	const a = resolveLineFromNode(range.startContainer);
	const b = resolveLineFromNode(range.endContainer);
	if (!a || !b) return null;

	// Normalize reversed selections (anchor below focus) so start <= end, and
	// take the side from whichever boundary is the actual start line.
	const [first, second] = a.line <= b.line ? [a, b] : [b, a];
	return { start: first.line, end: second.line, side: first.side };
}
