import { describe, expect, it } from "bun:test";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isElementNode,
	createEditor,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	type LexicalEditor,
} from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import { registerHistoryNavigation } from "./historyNavigation";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(history: string[]) {
	const editor = createEditor({
		namespace: "history-test",
		nodes: [MentionChipNode],
		onError: (error) => {
			throw error;
		},
	});
	registerHistoryNavigation(editor, () => history);
	return editor;
}

async function setContent(
	editor: LexicalEditor,
	build: (paragraph: ReturnType<typeof $createParagraphNode>) => void,
	caret: "start" | "end",
) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			build(paragraph);
			$getRoot().clear().append(paragraph);
			if (caret === "start") paragraph.selectStart();
			else paragraph.selectEnd();
		},
		{ discrete: true },
	);
	await tick();
}

async function press(editor: LexicalEditor, key: "up" | "down") {
	editor.update(
		() => {
			editor.dispatchCommand(
				key === "up" ? KEY_ARROW_UP_COMMAND : KEY_ARROW_DOWN_COMMAND,
				null as unknown as KeyboardEvent,
			);
		},
		{ discrete: true },
	);
	await tick();
}

const read = (editor: LexicalEditor) =>
	editor.getEditorState().read(() => {
		const paragraph = $getRoot().getFirstChild();
		return {
			text: $getRoot().getTextContent(),
			hasChip:
				$isElementNode(paragraph) &&
				paragraph.getChildren().some((node) => node instanceof MentionChipNode),
		};
	});

describe("registerHistoryNavigation", () => {
	it("recalls newest first from an empty box and walks back to an empty box", async () => {
		const editor = setup(["first", "second"]);
		await setContent(editor, () => {}, "end");

		await press(editor, "up");
		expect(read(editor).text).toBe("second");
		await press(editor, "up");
		expect(read(editor).text).toBe("first");
		await press(editor, "down");
		await press(editor, "down");
		expect(read(editor).text).toBe("");
	});

	it("leaves a draft alone when the caret is not at the start", async () => {
		const editor = setup(["first"]);
		await setContent(
			editor,
			(paragraph) => paragraph.append($createTextNode("my draft")),
			"end",
		);

		await press(editor, "up");
		expect(read(editor).text).toBe("my draft");
	});

	it("restores a draft with a chip after a round trip", async () => {
		const editor = setup(["first"]);
		await setContent(
			editor,
			(paragraph) =>
				paragraph.append(
					MentionChipNode.fromChip({ label: "/review", serialized: "/review" }),
					$createTextNode(" draft"),
				),
			"start",
		);

		await press(editor, "up");
		expect(read(editor).text).toBe("first");
		await press(editor, "down");
		expect(read(editor).hasChip).toBe(true);
		expect(read(editor).text).toContain(" draft");
	});

	it("keeps an edit made to a recalled message", async () => {
		const editor = setup(["first", "second"]);
		await setContent(editor, () => {}, "end");
		await press(editor, "up");
		await setContent(
			editor,
			(paragraph) => paragraph.append($createTextNode("second PLUS MY EDIT")),
			"end",
		);

		await press(editor, "down");
		expect(read(editor).text).toBe("second PLUS MY EDIT");
		await press(editor, "up");
		expect(read(editor).text).toBe("second PLUS MY EDIT");
	});
});
