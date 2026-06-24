import type { SelectionSide } from "@pierre/diffs";

// ponytail: reads undocumented @pierre/diffs DOM internals (data-line /
// data-line-type rows, data-additions/data-deletions columns) since there's no
// selection API. Re-verify attribute names on upgrade. Upstream:
// github.com/pierredotco/diffs#248.

/** Minimal ShadowRoot shape we read; narrowed for testing without a real DOM.
 *  `getSelection` is non-standard (Chromium-only). */
export interface DiffSelectionRoot {
	getSelection?: () => DiffSelectionLike | null;
}

interface DiffSelectionLike {
	rangeCount: number;
	getRangeAt(index: number): DiffSelectionRange;
}

/** A selection boundary node we can climb from to the nearest line element. */
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
	if (code.hasAttribute("data-additions")) return "additions";
	if (code.hasAttribute("data-deletions")) return "deletions";
	// Tolerate an older/future shape where the side is the `data-code` value.
	const dataCode = code.getAttribute("data-code");
	if (dataCode === "additions" || dataCode === "deletions") return dataCode;
	return undefined;
}

/** Climb from a selection boundary to the nearest `[data-line]` row and read its
 *  line number + side. Null if there's no row or the line isn't a number. */
function resolveLineFromNode(
	node: DiffSelectionNode | null,
): ResolvedLine | null {
	// Text nodes (the common case) can't `closest`, so climb to the parent first.
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

/** Resolve a highlighted text selection in a `<diffs-container>` shadow root
 *  into the `{ start, end, side }` shape the gutter selection produces, or null
 *  when there's no usable line selection. */
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

	// Normalize reversed selections so start <= end; side comes from the start.
	const [first, second] = a.line <= b.line ? [a, b] : [b, a];
	return { start: first.line, end: second.line, side: first.side };
}
