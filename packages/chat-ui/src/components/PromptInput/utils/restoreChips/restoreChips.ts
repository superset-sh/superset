import { $createTextNode, $getRoot, type LexicalNode } from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerChipMatch } from "../../types";

/**
 * Replaces the spans `findChips` reports in each text node with chip nodes.
 * The text a chip serializes to is what it replaces, so the editor's text
 * content does not change.
 */
export function $restoreChips(
	findChips: (text: string) => ComposerChipMatch[],
): boolean {
	let restored = false;
	for (const textNode of $getRoot().getAllTextNodes()) {
		const text = textNode.getTextContent();
		const matches = findChips(text);
		if (matches.length === 0) continue;
		const pieces: LexicalNode[] = [];
		let cursor = 0;
		for (const match of matches) {
			if (match.start > cursor) {
				pieces.push($createTextNode(text.slice(cursor, match.start)));
			}
			pieces.push(MentionChipNode.fromChip(match.chip));
			cursor = match.end;
		}
		if (cursor < text.length) pieces.push($createTextNode(text.slice(cursor)));
		let anchor: LexicalNode = textNode;
		for (const piece of pieces) {
			anchor.insertAfter(piece);
			anchor = piece;
		}
		textNode.remove();
		restored = true;
	}
	return restored;
}
