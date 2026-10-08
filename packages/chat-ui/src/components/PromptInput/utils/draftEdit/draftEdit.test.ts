import { describe, expect, it } from "bun:test";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	createEditor,
	type LexicalEditor,
} from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import { $restoreChips } from "../restoreChips";
import { registerDraftEdit } from "./draftEdit";

const seededText = "@linear ";
const linearChip = { label: "Linear", serialized: "@linear" };

function setText(editor: LexicalEditor, text: string) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(text));
			$getRoot().clear().append(paragraph);
		},
		{ discrete: true },
	);
}

function setup() {
	const editor = createEditor({
		namespace: "draft-edit-test",
		nodes: [MentionChipNode],
		onError: (error) => {
			throw error;
		},
	});
	let edits = 0;
	registerDraftEdit(editor, seededText, () => {
		edits += 1;
	});
	return { editor, edits: () => edits };
}

describe("registerDraftEdit", () => {
	it("does not count seeding the draft or restoring its chips", () => {
		const { editor, edits } = setup();
		setText(editor, seededText);
		editor.update(
			() => {
				$restoreChips(() => [{ start: 0, end: 7, chip: linearChip }]);
			},
			{ discrete: true },
		);
		expect(edits()).toBe(0);
	});

	it("stays edited after the text is typed back to the draft", () => {
		const { editor, edits } = setup();
		setText(editor, seededText);
		setText(editor, `${seededText}x`);
		setText(editor, seededText);
		setText(editor, `${seededText}y`);
		expect(edits()).toBe(1);
	});
});
