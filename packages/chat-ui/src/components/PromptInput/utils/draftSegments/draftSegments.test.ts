import { describe, expect, test } from "bun:test";
import { $getRoot, createEditor } from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerDraftSegment } from "../../types";
import {
	$insertDraftSegments,
	$readDraftSegments,
	draftText,
} from "./draftSegments";

const chip = { label: "Linear", serialized: "@linear", data: { id: 7 } };

function roundTrip(segments: ComposerDraftSegment[]) {
	const editor = createEditor({
		nodes: [MentionChipNode],
		onError: (error) => {
			throw error;
		},
	});
	let read: ComposerDraftSegment[] = [];
	let text = "";
	editor.update(
		() => {
			$insertDraftSegments(segments);
			read = $readDraftSegments();
			text = $getRoot().getTextContent();
		},
		{ discrete: true },
	);
	return { read, text };
}

describe("draft segments", () => {
	test("text, chips and line breaks survive a round trip", () => {
		const segments: ComposerDraftSegment[] = [
			{ type: "text", text: "fix " },
			{ type: "chip", chip },
			{ type: "text", text: " now\nplease" },
		];
		const { read, text } = roundTrip(segments);
		expect(read).toEqual(segments);
		expect(text).toBe(draftText(segments));
	});

	test("an empty editor reads as no segments", () => {
		expect(roundTrip([]).read).toEqual([]);
	});
});
