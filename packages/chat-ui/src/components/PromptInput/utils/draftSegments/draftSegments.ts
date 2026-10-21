import {
	$getRoot,
	$getSelection,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isTextNode,
	type LexicalNode,
} from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerDraftSegment } from "../../types";

/** The editor's content as text runs and chips, in order; the text matches `getTextContent()`. */
export function $readDraftSegments(): ComposerDraftSegment[] {
	const segments: ComposerDraftSegment[] = [];
	let text = "";
	const flush = () => {
		if (text === "") return;
		segments.push({ type: "text", text });
		text = "";
	};
	const visit = (node: LexicalNode) => {
		if (node instanceof MentionChipNode) {
			flush();
			segments.push({ type: "chip", chip: node.toChip() });
			return;
		}
		if ($isTextNode(node)) {
			text += node.getTextContent();
			return;
		}
		if ($isLineBreakNode(node)) {
			text += "\n";
			return;
		}
		if ($isElementNode(node)) {
			for (const child of node.getChildren()) visit(child);
		}
	};
	const blocks = $getRoot().getChildren();
	blocks.forEach((block, index) => {
		visit(block);
		if (index < blocks.length - 1) text += "\n\n";
	});
	flush();
	return segments;
}

/** Inserts the segments at the selection, or at the end when nothing is selected. */
export function $insertDraftSegments(
	segments: readonly ComposerDraftSegment[],
): void {
	if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
	for (const segment of segments) {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return;
		if (segment.type === "text") {
			selection.insertRawText(segment.text);
		} else {
			selection.insertNodes([MentionChipNode.fromChip(segment.chip)]);
		}
	}
}

export function draftText(segments: readonly ComposerDraftSegment[]): string {
	return segments
		.map((segment) =>
			segment.type === "text" ? segment.text : segment.chip.serialized,
		)
		.join("");
}
