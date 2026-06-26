import type { Node } from "@tiptap/pm/model";
import type { Command } from "@tiptap/pm/state";

// Resolves the position right after the previous hardBreak in the same parent
// block, or the parent block's content start. Returns null when `pos` is
// already at a line start.
export function findLineStartFromPos(doc: Node, pos: number): number | null {
	const $pos = doc.resolve(pos);
	if (!$pos.parent.isTextblock) return null;
	const parentStart = $pos.start($pos.depth);

	let target = parentStart;
	$pos.parent.forEach((child, offsetInParent) => {
		if (child.type.name !== "hardBreak") return;
		const absEnd = parentStart + offsetInParent + child.nodeSize;
		if (absEnd <= pos && absEnd > target) {
			target = absEnd;
		}
	});

	return target >= pos ? null : target;
}

export const deleteToLineStart: Command = (state, dispatch) => {
	const { from, to, empty } = state.selection;
	if (!empty) return false;
	const target = findLineStartFromPos(state.doc, from);
	if (target === null) return false;
	if (dispatch) dispatch(state.tr.delete(target, to));
	return true;
};
