import type { Editor } from "@tiptap/core";

/**
 * Serializes Tiptap editor content to plain text for submission.
 * FileMentionNode atoms → "@path", text nodes → text, hardBreaks → "\n",
 * block-level nodes separated by "\n".
 */
export function serializeEditorToText(editor: Editor): string {
	const lines: string[] = [];

	editor.state.doc.forEach((blockNode) => {
		const parts: string[] = [];

		blockNode.forEach((child) => {
			if (child.type.name === "file-mention") {
				const p = child.attrs.path as string;
				parts.push(p.includes(" ") ? `@"${p}"` : `@${p}`);
			} else if (child.type.name === "slash-command") {
				const cmdName = child.attrs.name as string;
				const cmdArgs = (child.attrs.args as string) ?? "";
				parts.push(cmdArgs ? `/${cmdName} ${cmdArgs}` : `/${cmdName}`);
			} else if (child.type.name === "hardBreak") {
				parts.push("\n");
			} else if (child.isText) {
				parts.push(child.text ?? "");
			}
		});

		lines.push(parts.join(""));
	});

	return lines.join("\n");
}
