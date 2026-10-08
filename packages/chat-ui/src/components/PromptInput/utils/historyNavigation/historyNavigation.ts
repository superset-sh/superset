import {
	$createParagraphNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_LOW,
	type EditorState,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	type LexicalEditor,
	type LexicalNode,
	type RangeSelection,
} from "lexical";

function $isCaretAtStart(selection: RangeSelection): boolean {
	if (selection.anchor.offset !== 0) return false;
	let node: LexicalNode | null = selection.anchor.getNode();
	while (node && node.getParent() !== null) {
		if (node.getPreviousSibling()) return false;
		node = node.getParent();
	}
	return true;
}

function $replaceText(text: string) {
	const paragraph = $createParagraphNode();
	$getRoot().clear().append(paragraph);
	paragraph.select().insertRawText(text);
}

export function registerHistoryNavigation(
	editor: LexicalEditor,
	getHistory: () => readonly string[],
): { reset: () => void; unregister: () => void } {
	let index: number | null = null;
	let recalled = "";
	let draft: EditorState | null = null;

	const navigate = (
		direction: "older" | "newer",
		event: KeyboardEvent | null,
	): boolean => {
		const history = getHistory();
		if (history.length === 0 || event?.defaultPrevented) return false;
		if (event?.shiftKey || event?.altKey || event?.metaKey || event?.ctrlKey)
			return false;
		const selection = $getSelection();
		if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
		const text = $getRoot().getTextContent();

		let next: number | null;
		if (index === null) {
			if (direction === "newer") return false;
			if (text !== "" && !$isCaretAtStart(selection)) return false;
			draft = editor.getEditorState();
			next = history.length - 1;
		} else {
			if (text !== recalled && text !== "") return false;
			next =
				direction === "older"
					? Math.max(0, index - 1)
					: index + 1 < history.length
						? index + 1
						: null;
		}

		event?.preventDefault();
		index = next;
		if (next !== null) {
			recalled = history[next] ?? "";
			$replaceText(recalled);
			return true;
		}
		recalled = "";
		const saved = draft;
		draft = null;
		queueMicrotask(() => {
			if (saved) editor.setEditorState(saved);
			else editor.update(() => $getRoot().clear());
			editor.update(() => $getRoot().selectEnd());
		});
		return true;
	};

	const unregisterUp = editor.registerCommand<KeyboardEvent | null>(
		KEY_ARROW_UP_COMMAND,
		(event) => navigate("older", event),
		COMMAND_PRIORITY_LOW,
	);
	const unregisterDown = editor.registerCommand<KeyboardEvent | null>(
		KEY_ARROW_DOWN_COMMAND,
		(event) => navigate("newer", event),
		COMMAND_PRIORITY_LOW,
	);

	return {
		reset: () => {
			index = null;
			recalled = "";
			draft = null;
		},
		unregister: () => {
			unregisterUp();
			unregisterDown();
		},
	};
}
