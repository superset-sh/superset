import { describe, expect, it } from "bun:test";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isElementNode,
	createEditor,
	type LexicalEditor,
} from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerChipMatch } from "../../types";
import { $restoreChips } from "./restoreChips";

const linearChip = { label: "Linear", serialized: "@linear" };

function findLinear(text: string): ComposerChipMatch[] {
	const matches: ComposerChipMatch[] = [];
	for (const match of text.matchAll(/@linear\b/g)) {
		const start = match.index ?? 0;
		matches.push({ start, end: start + match[0].length, chip: linearChip });
	}
	return matches;
}

function editorWith(text: string): LexicalEditor {
	const editor = createEditor({
		namespace: "restore-chips-test",
		nodes: [MentionChipNode],
		onError: (error) => {
			throw error;
		},
	});
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(text));
			$getRoot().clear().append(paragraph);
		},
		{ discrete: true },
	);
	return editor;
}

const read = (editor: LexicalEditor) =>
	editor.getEditorState().read(() => {
		const paragraph = $getRoot().getFirstChild();
		return {
			text: $getRoot().getTextContent(),
			children: $isElementNode(paragraph)
				? paragraph
						.getChildren()
						.map((node) =>
							node instanceof MentionChipNode
								? `chip:${node.toChip().label}`
								: `text:${node.getTextContent()}`,
						)
				: [],
		};
	});

describe("$restoreChips", () => {
	it("turns matched spans into chips and keeps the text content", () => {
		const editor = editorWith("Ask @linear then @linear now");
		let restored = false;
		editor.update(
			() => {
				restored = $restoreChips(findLinear);
			},
			{ discrete: true },
		);
		expect(restored).toBe(true);
		expect(read(editor)).toEqual({
			text: "Ask @linear then @linear now",
			children: [
				"text:Ask ",
				"chip:Linear",
				"text: then ",
				"chip:Linear",
				"text: now",
			],
		});
	});

	it("leaves text without matches alone", () => {
		const editor = editorWith("Ask @slack ");
		let restored = true;
		editor.update(
			() => {
				restored = $restoreChips(findLinear);
			},
			{ discrete: true },
		);
		expect(restored).toBe(false);
		expect(read(editor).children).toEqual(["text:Ask @slack "]);
	});
});
